import './style.css';
import './overrides.css';
import { createClient } from '@supabase/supabase-js';
import { cleanRows, createCsv, parseVocabularyCsv, safeFilename } from './csv.js';

const app = document.querySelector('#app');
const indicator = document.querySelector('#stepIndicator');
const TRANSFER_KEY = 'rovocar:csv-maker-transfer:v1';
const state = { file: null, objectUrl: null, rotation: 0, rows: [], warnings: [], error: '' };
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
const csvMakerUrl = new URL('.', window.location.href).href;
const rovocarHomeUrl = new URL('../', csvMakerUrl).href;
let session = null;
let sessionRevision = 0;
let sampleRows = [
  { english: 'take care of', korean: '돌보다' },
  { english: 'involve', korean: '수반하다, 포함하다' },
];

const demoRows = [
  { english: 'take care of', korean: '돌보다', confidence: 'high', note: '' },
  { english: 'right, correct', korean: '옳은', confidence: 'low', note: '쉼표 앞뒤의 단어를 확인하세요.' },
  { english: 'involve', korean: '수반하다, 포함하다', confidence: 'high', note: '' },
];
const referenceFiles = ['2026-07-13.csv', '5월19일_001.csv', '5월19일_002.csv', '5월19일_003.csv'];

function setStep(label) { indicator.textContent = label; }
function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
}
function status(message, kind = '') { return `<p class="status ${kind}" role="status" aria-live="polite">${message}</p>`; }
function revokePreview() { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
async function updateSession() { if (supabase) ({ data: { session } } = await supabase.auth.getSession()); }
function defaultDeckTitle(date = new Date()) { return `${date.toISOString().slice(0, 10)} 영단어`; }
function sampleMarkup() {
  return sampleRows.slice(0, 2).map((row, index) => `
        <div class="sample-row"><span>${String(index + 1).padStart(2, '0')}</span><b>${escapeHtml(row.english)}</b><i>${escapeHtml(row.korean)}</i></div>`).join('');
}
function pickRandom(items, count) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
async function loadSampleRows() {
  const loaded = await Promise.all(referenceFiles.map(async (file) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}reference/${encodeURIComponent(file)}`);
      if (!response.ok) return [];
      return parseVocabularyCsv(await response.text());
    } catch {
      return [];
    }
  }));
  const rows = loaded.flat();
  if (rows.length >= 2) sampleRows = pickRandom(rows, 2);
}
async function login() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: csvMakerUrl } });
  if (error) renderError('로그인을 시작하지 못했어요', '잠시 뒤 다시 시도해 주세요.');
}

function renderStart() {
  setStep('사진 선택');
  app.innerHTML = `
    <section class="hero" id="start">
      <p class="eyebrow">단어장 한 장 → RoVoCar CSV</p>
      <h1>손글씨 단어장을<br><em>바로 넣을 수 있게.</em></h1>
      <p class="lede">사진에서 영어와 뜻을 읽고, 틀린 곳만 고쳐 CSV로 내려받으세요.</p>
      <div class="paper-sample" aria-hidden="true">
${sampleMarkup()}
        <div class="red-pencil">검토 후 완성!</div>
      </div>
      ${supabase && !session ? '<button class="upload-cta" id="loginButton"><span>카카오 로그인하고 시작</span><small>가족용 사용량을 안전하게 보호합니다</small></button>' : '<label class="upload-cta" for="photoInput"><span>사진 찍기 또는 선택</span><small>JPEG · PNG · WebP / 한 장씩</small></label>'}
      <a class="secondary wide garage-return-main" href="${rovocarHomeUrl}">RoVoCar 차고로 돌아가기</a>
      <input id="photoInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" />
      <p class="privacy-note">사진은 추출 요청 처리 후 서버에 저장하지 않으며, 결과는 이 브라우저에서 CSV를 만들 때만 사용됩니다. 실제 추출 때 사진은 <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini 제공자</a>에게 전송됩니다.${supabase ? '' : ' 현재는 로컬 데모 모드입니다.'}</p>
    </section>`;
  if (supabase && !session) document.querySelector('#loginButton').addEventListener('click', login);
  else document.querySelector('#photoInput').addEventListener('change', onChooseFile);
}

function onChooseFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const supported = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supported.includes(file.type)) {
    renderError('이 사진 형식은 사용할 수 없어요', file.type === 'image/heic' ? 'iPhone HEIC 사진은 아직 지원하지 않습니다. 사진 앱에서 JPEG로 변환해 다시 선택하세요.' : 'JPEG, PNG 또는 WebP 사진 한 장을 선택하세요.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    renderError('사진 파일이 너무 커요', '8MB 이하의 선명한 사진을 다시 선택하세요.');
    return;
  }
  revokePreview(); state.file = file; state.objectUrl = URL.createObjectURL(file); state.rotation = 0; renderPreview();
}

function renderPreview() {
  setStep('사진 확인');
  app.innerHTML = `<section class="workflow"><p class="eyebrow">선택한 사진</p><h1>글자가 모두<br>보이나요?</h1>
    <div class="photo-frame"><img id="previewImage" src="${state.objectUrl}" alt="선택한 단어장 사진 미리보기" style="transform: rotate(${state.rotation}deg)"></div>
    <ul class="checklist"><li>영어와 한글 뜻이 모두 보이나요?</li><li>흐림, 그림자, 손가락이 글자를 가리지 않나요?</li><li>종이가 가능한 한 반듯하게 찍혔나요?</li></ul>
    <div class="button-row"><button class="secondary" id="rotate">↻ 회전</button><label class="secondary file-label" for="replacePhoto">다시 선택</label><input class="sr-only" id="replacePhoto" type="file" accept="image/jpeg,image/png,image/webp"></div>
    <button class="primary wide" id="extract">단어 추출하기 <span>→</span></button>
    ${status(supabase ? '사진 속 단어가 많으면 추출에 1분 정도 걸릴 수 있어요.' : '현재는 로컬 데모 결과를 보여 줍니다.', 'info')}
  </section>`;
  document.querySelector('#rotate').addEventListener('click', () => { state.rotation = (state.rotation + 90) % 360; renderPreview(); });
  document.querySelector('#replacePhoto').addEventListener('change', onChooseFile);
  document.querySelector('#extract').addEventListener('click', renderExtracting);
}

async function fileAsBase64(file) {
  const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return String(url).split(',', 2)[1];
}
async function extractFromServer() {
  const file = state.file, revision = sessionRevision, userId = session?.user?.id;
  const isCurrent = () => revision === sessionRevision && session?.user?.id === userId;
  const { data: { session: currentSession } } = await supabase.auth.getSession();
  if (!currentSession || !file || !isCurrent() || currentSession.user.id !== userId) throw { error: 'authentication_required' };
  session = currentSession;
  const data = await fileAsBase64(file);
  if (!isCurrent()) throw { error: 'authentication_required' };
  const response = await fetch(`${supabaseUrl}/functions/v1/extract-vocabulary`, { method: 'POST', headers: { authorization: `Bearer ${currentSession.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ image: { mimeType: file.type, data } }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw { ...payload, error: payload.error || (response.status === 401 ? 'authentication_required' : 'extraction_unavailable') };
  return payload;
}
async function renderExtracting() {
  const revision = sessionRevision;
  setStep('추출 중');
  app.innerHTML = `<section class="center-state"><div class="scan-mark" aria-hidden="true"></div><p class="eyebrow">사진을 읽는 중</p><h1>영어와 뜻을<br>나누고 있어요.</h1><div class="extract-progress" role="progressbar" aria-label="단어 추출 진행 중" aria-valuemin="0" aria-valuemax="100"><span></span></div>${status('같은 사진을 다시 보내지 않도록 잠시만 기다려 주세요.')}</section>`;
  try {
    if (supabase) {
      if (!session) { renderError('다시 로그인해 주세요', '사진을 읽으려면 로그인 상태가 필요합니다.', renderStart); return; }
      const result = await extractFromServer(); if (revision !== sessionRevision) return; state.rows = result.items; state.warnings = result.warnings; renderReview(); return;
    }
    window.setTimeout(() => { state.rows = structuredClone(demoRows); state.warnings = ['사진 오른쪽 가장자리의 한 행은 잘렸을 수 있어요.']; renderReview(); }, 1050);
  } catch (error) {
    if (revision !== sessionRevision) return;
    const message = error?.error === 'daily_limit' ? '가족용 오늘 사용 횟수를 모두 썼어요. 내일 다시 시도해 주세요.' : error?.error === 'unsupported_image' || error?.error === 'image_too_large' || error?.error === 'server_configuration' || error?.error === 'gemini_access_denied' || error?.error === 'gemini_rate_limited' || error?.error === 'invalid_extraction' || error?.error === 'extraction_timeout' || error?.error === 'extraction_unavailable' ? error.message : error?.error === 'authentication_required' ? '로그인이 만료되었어요. 다시 로그인해 주세요.' : '사진을 읽지 못했어요. 잠시 뒤 다시 시도하거나 사진을 바꿔 주세요.';
    renderError('추출을 완료하지 못했어요', message, renderPreview);
  }
}

function rowWarnings(row, index) {
  const messages = [];
  if (!row.english.trim() || !row.korean.trim()) messages.push('영어와 뜻을 모두 입력하세요.');
  if (row.confidence === 'low') messages.push(row.note || '글자를 다시 확인하세요.');
  const duplicate = state.rows.findIndex((item) => item.english.trim().toLocaleLowerCase() === row.english.trim().toLocaleLowerCase());
  if (row.english.trim() && duplicate !== index) messages.push('같은 영어 단어가 있어요. 자동으로 지우지 않습니다.');
  return messages;
}
function renderReview() {
  setStep('결과 검토');
  const valid = cleanRows(state.rows).length;
  app.innerHTML = `<section class="review"><p class="eyebrow">추출 초안</p><h1>한 번만 확인하면<br><em>준비 끝이에요.</em></h1>
    <div class="extract-count" role="status"><b>${valid}</b><span>개 단어 추출</span></div>
    ${state.warnings.map((warning) => `<p class="warning-banner">확인 필요: ${escapeHtml(warning)}</p>`).join('')}
    ${state.rows.length ? '' : '<div class="empty-result" role="status"><b>읽을 수 있는 단어를 찾지 못했어요.</b><span>사진을 다시 선택하거나 아래에서 직접 행을 추가해 주세요.</span></div>'}
    <div class="table-wrap"><table><thead><tr><th scope="col">번호</th><th scope="col">영어 스펠링</th><th scope="col">한글 뜻</th><th><span class="sr-only">행 관리</span></th></tr></thead><tbody>
      ${state.rows.map((row, index) => { const warnings = rowWarnings(row, index); return `<tr class="${warnings.length ? 'needs-check' : ''}"><td class="row-number">${index + 1}</td><td><label class="sr-only" for="english-${index}">${index + 1}번 영어 스펠링</label><input id="english-${index}" data-index="${index}" data-key="english" value="${escapeHtml(row.english)}" placeholder="영어 단어" autocomplete="off" autocapitalize="none" spellcheck="false"></td><td><label class="sr-only" for="korean-${index}">${index + 1}번 한글 뜻</label><input id="korean-${index}" data-index="${index}" data-key="korean" value="${escapeHtml(row.korean)}" placeholder="한글 뜻" autocomplete="off" autocorrect="off" spellcheck="false">${warnings.map((warning) => `<small class="row-warning">! ${escapeHtml(warning)}</small>`).join('')}</td><td><button class="delete-row" data-delete="${index}" aria-label="${index + 1}번 행 삭제">×</button></td></tr>`; }).join('')}
    </tbody></table></div>
    <button class="add-row" id="addRow">+ 행 추가</button>
    <label class="title-field">단어장 이름 <span>(선택)</span><input id="listTitle" maxlength="48" placeholder="${defaultDeckTitle()}"></label>
    <button class="primary wide" id="applyToRovocar">RoVoCar 단어장에 바로 적용 <span>→</span></button>
    <button class="secondary wide download-only" id="download">CSV만 다운로드 <span>↓</span></button>
    ${status(`빈 영어 또는 뜻 행 ${state.rows.length - valid}개는 다운로드에서 제외됩니다.`, 'info')}
  </section>`;
  // Re-render only after the field is committed. Re-rendering on each keystroke
  // would steal focus and make long Korean meanings impossible to type.
  app.querySelectorAll('input[data-key]').forEach((input) => input.addEventListener('change', ({ target }) => { state.rows[Number(target.dataset.index)][target.dataset.key] = target.value; renderReview(); }));
  app.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => { state.rows.splice(Number(button.dataset.delete), 1); renderReview(); }));
  document.querySelector('#addRow').addEventListener('click', () => { state.rows.push({ english: '', korean: '', confidence: 'high', note: '' }); renderReview(); });
  document.querySelector('#download').addEventListener('click', downloadCsv);
  document.querySelector('#applyToRovocar').addEventListener('click', applyToRovocar);
}

function preparedRowsOrError() {
  const included = cleanRows(state.rows);
  if (!included.length) {
    renderError('적용할 단어가 없어요', '영어와 한글 뜻을 모두 입력한 행을 하나 이상 만들어 주세요.', renderReview);
    return null;
  }
  return included;
}
function downloadCsv() {
  const included = preparedRowsOrError();
  if (!included) return;
  const title = document.querySelector('#listTitle')?.value;
  const blob = new Blob([createCsv(included)], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = safeFilename(title); link.click(); URL.revokeObjectURL(link.href); renderDone(included.length);
}
function applyToRovocar() {
  const included = preparedRowsOrError();
  if (!included) return;
  const title = document.querySelector('#listTitle')?.value?.trim() || defaultDeckTitle();
  localStorage.setItem(TRANSFER_KEY, JSON.stringify({ title, csv: createCsv(included), count: included.length, createdAt: new Date().toISOString() }));
  window.location.href = `${rovocarHomeUrl}?import=csv-maker`;
}
function renderDone(count) {
  setStep('다운로드 완료');
  app.innerHTML = `<section class="done"><div class="done-stamp">CSV<br>완성</div><p class="eyebrow">${count}개 단어 저장</p><h1>이제 RoVoCar에<br>넣어 주세요.</h1><ol class="steps"><li><b>1</b><span>RoVoCar에서 새 단어장을 엽니다.</span></li><li><b>2</b><span><strong>CSV 불러오기</strong>를 누릅니다.</span></li><li><b>3</b><span>방금 받은 파일을 선택합니다.</span></li></ol><a class="primary wide" href="${rovocarHomeUrl}">RoVoCar 열기 <span>↗</span></a><button class="secondary wide new-photo" id="newPhoto">새 사진으로 만들기</button></section>`;
  document.querySelector('#newPhoto').addEventListener('click', () => { revokePreview(); state.file = null; state.rows = []; renderStart(); });
}
function renderError(title, detail, back = renderStart) {
  setStep('다시 확인');
  app.innerHTML = `<section class="center-state error-state"><p class="error-symbol" aria-hidden="true">!</p><p class="eyebrow">사진을 확인해 주세요</p><h1 id="errorTitle" tabindex="-1">${escapeHtml(title)}</h1><p class="lede">${escapeHtml(detail)}</p><button class="primary" id="tryAgain">사진 다시 선택</button><button class="text-button" id="goBack">돌아가기</button></section>`;
  document.querySelector('#errorTitle').focus(); document.querySelector('#tryAgain').addEventListener('click', renderStart); document.querySelector('#goBack').addEventListener('click', back);
}
function onAuthSessionChanged(_event, nextSession) {
  const previousUser = session?.user?.id;
  session = nextSession;
  if (previousUser === nextSession?.user?.id) return;
  sessionRevision++;
  revokePreview();
  state.file = null;
  state.rows = [];
  state.warnings = [];
  renderStart();
}
window.addEventListener('beforeunload', revokePreview);
await updateSession();
await loadSampleRows();
if (supabase) supabase.auth.onAuthStateChange(onAuthSessionChanged);
renderStart();
