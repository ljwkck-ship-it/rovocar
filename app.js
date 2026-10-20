import { normalizeEnglish, normalizeKorean, parseCsv, koreanAnswerCandidates } from './core.mjs';

const STORAGE_KEY = 'rovocar:data:v1';
const REGISTRY_KEY = 'rovocar:registry:v1';
const CSV_MAKER_TRANSFER_KEY = 'rovocar:csv-maker-transfer:v1';
const state = { decks: [], registry: {}, currentDeckId: null, view: 'garage', game: null, deferredInstall: null, importWords: [], importTargetDeckId: null, storageKey: STORAGE_KEY, registryKey: REGISTRY_KEY, cloudUser: null, deckQuery: '', pendingSyncDecision: null, dataVersion: 0 };
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['garageView','deckView','gameView','resultView','deckGrid','deckTitle','deckSummary','masteryValue','modeStats','wordCount','wordList','deckDialog','deckForm','deckNameInput','wordDialog','wordForm','wordDialogTitle','englishInput','koreanInput','editingWordId','gameModeLabel','gameTitle','gameCounter','route','routeFill','routeCar','promptLabel','promptText','wordRegistryLabel','speakBtn','answerForm','answerLabel','answerInput','cardControls','cardRevealBtn','cardMarkActions','cardKnownBtn','cardUnknownBtn','feedback','nextBtn','resultScore','resultRate','resultMessage','retryWrongBtn','toast','installBtn','installDialog','csvInput','appendCsvInput','importDialog','importForm','importSummary','importDeckName','importPreview','importDialogTitle','importConfirmBtn','authBtn','syncBadge','deckSearch','deckResultCount','renameDeckBtn','deleteDeckBtn','renameDialog','renameForm','renameDeckInput','syncDecisionDialog','syncDecisionTitle','syncDecisionCopy','syncUseRemoteBtn','syncKeepLocalBtn'].map(id=>[id,$(id)]));
const MODE_META = {
  card: { key:'card', label:'카드', drive:'DRIVE 01', prompt:'영어 카드를 터치해 뜻을 확인하세요.' },
  'en-ko': { key:'meaning', label:'뜻', drive:'DRIVE 02', prompt:'영어를 보고 한글 뜻을 입력하세요' },
  'ko-en': { key:'spelling', label:'스펠링', drive:'DRIVE 03', prompt:'한글 뜻을 보고 영어 스펠링을 입력하세요' }
};

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const shuffle = source => { const a=[...source]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
let pendingCsvMakerTransfer=null;
async function loadData(){
  if(loadFromStorage(state.storageKey))return;
  state.decks=[];state.registry={};save(false);
}
function loadFromStorage(key){try{const saved=localStorage.getItem(key);if(saved){state.decks=JSON.parse(saved);loadRegistry();return true;}}catch{}return false;}
function loadRegistry(){try{state.registry=JSON.parse(localStorage.getItem(state.registryKey)||'{}');}catch{state.registry={};}ensureRegistryNumbers();}
function registryNumber(english){const key=normalizeEnglish(english);if(state.registry[key])return state.registry[key];const next=Math.max(0,...Object.values(state.registry).map(Number))+1;state.registry[key]=next;return next;}
function ensureRegistryNumbers(){
  const repaired={},used=new Set();let next=1;
  for(const [key,value] of Object.entries(state.registry||{}).sort((a,b)=>Number(a[1])-Number(b[1]))){let no=Number(value);if(!Number.isInteger(no)||no<1||used.has(no)){while(used.has(next))next++;no=next;}repaired[key]=no;used.add(no);next=Math.max(next,no+1);}
  state.registry=repaired;
  for(const deck of [...state.decks].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)))for(const word of deck.words)word.registryNo=registryNumber(word.english);
}
let cloudSyncTimer;
function save(sync=true){ensureRegistryNumbers();localStorage.setItem(state.storageKey,JSON.stringify(state.decks));localStorage.setItem(state.registryKey,JSON.stringify(state.registry));if(sync){state.dataVersion++;if(state.cloudUser&&window.RoVoCloud){RoVoCloud.markDirty();clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(()=>RoVoCloud.flush(state.decks,state.registry).then(result=>{if(result?.kind)handleSyncResult(result);}).catch(()=>{}),700);}}}
function currentDeck(){return state.decks.find(d=>d.id===state.currentDeckId);}
function emptyStats(){return {card:{attempts:0,correct:0},meaning:{attempts:0,correct:0},spelling:{attempts:0,correct:0}};}
function ensureWordStats(word){word.stats={...emptyStats(),...(word.stats||{})};for(const key of Object.keys(emptyStats()))word.stats[key]={attempts:Math.max(0,Number(word.stats[key]?.attempts)||0),correct:Math.max(0,Number(word.stats[key]?.correct)||0)};return word.stats;}
function newWordRecord(word){return {...word,id:uid(),attempts:0,correct:0,stats:emptyStats()};}
function rateOf(stats){return stats.attempts?Math.round(stats.correct/stats.attempts*100):0;}
function deckStats(deck){const modes=emptyStats();let attempts=0,correct=0;for(const word of deck.words){const stats=ensureWordStats(word);let modeAttempts=0,modeCorrect=0;for(const key of Object.keys(modes)){modes[key].attempts+=stats[key].attempts;modes[key].correct+=stats[key].correct;modeAttempts+=stats[key].attempts;modeCorrect+=stats[key].correct;}attempts+=modeAttempts+Math.max(0,(word.attempts||0)-modeAttempts);correct+=modeCorrect+Math.max(0,(word.correct||0)-modeCorrect);}return {attempts,correct,rate:attempts?Math.round(correct/attempts*100):0,modes};}
function focusViewHeading(name){const heading={garage:'garageTitle',deck:'deckTitle',game:'gameTitle',result:'resultTitle'}[name];if(!heading)return;requestAnimationFrame(()=>$(heading)?.focus({preventScroll:true}));}
function showView(name){state.view=name;['garage','deck','game','result'].forEach(v=>els[`${v}View`].classList.toggle('hidden',v!==name));scrollTo({top:0,behavior:'smooth'});if(name==='garage')renderGarage();if(name==='deck')renderDeck();focusViewHeading(name);}
function renderGarage(){
  const query=state.deckQuery.trim().toLowerCase();const decks=[...state.decks].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).filter(deck=>!query||deck.name.toLowerCase().includes(query));
  els.deckResultCount.textContent=query?`${decks.length}개 찾음`:`총 ${state.decks.length}개`;
  if(!decks.length){els.deckGrid.innerHTML=`<div class="empty-garage"><img src="assets/rovocar.svg" alt=""><h3>${state.decks.length?'검색 결과가 없어요':'차고가 비어 있어요'}</h3><p>${state.decks.length?'다른 이름으로 검색해 보세요.':'사진으로 단어장을 만들거나 직접 첫 단어장을 만들어 보세요.'}</p>${state.decks.length?'':'<button class="secondary-btn" type="button" data-new-empty>직접 만들기</button>'}</div>`;return;}
  els.deckGrid.innerHTML=decks.map((d,i)=>{const s=deckStats(d);return `<button class="deck-tile" data-deck="${d.id}" type="button"><span class="eyebrow">CAR ${String(i+1).padStart(2,'0')}</span><h3>${escapeHtml(d.name)}</h3><p class="tile-meta">${d.words.length}개 단어</p><span class="tile-bottom"><span class="tile-progress"><b>${s.rate}%</b><span>${s.attempts ? `${s.attempts}번 주행 기록` : '첫 주행 전'}</span></span><span class="tile-arrow">→</span></span></button>`}).join('');
}
function renderDeck(){
  const d=currentDeck();if(!d)return showView('garage');const s=deckStats(d);els.deckTitle.textContent=d.name;els.deckSummary.textContent=`${d.words.length}개의 단어가 이 차에 실려 있어요.`;els.masteryValue.textContent=`${s.rate}%`;els.wordCount.textContent=d.words.length;
  els.modeStats.innerHTML=['card','meaning','spelling'].map(key=>`<div><b>${{card:'카드',meaning:'뜻',spelling:'스펠링'}[key]}</b><span>${rateOf(s.modes[key])}%</span><small>${s.modes[key].attempts?`${s.modes[key].attempts}번`:'기록 없음'}</small></div>`).join('');
  els.wordList.innerHTML=d.words.length?d.words.map(w=>`<div class="word-row"><span class="number" title="내 ${w.registryNo}번째 영어 단어">#${String(w.registryNo).padStart(4,'0')}</span><b>${escapeHtml(w.english)}</b><span>${escapeHtml(w.korean)}</span><span class="word-row-actions"><button type="button" data-edit-word="${w.id}">수정</button><button type="button" data-delete-word="${w.id}">삭제</button></span></div>`).join(''):`<div class="empty-garage"><p>아직 실린 단어가 없어요. 단어를 먼저 추가해 주세요.</p></div>`;
}
function openDeckDialog(){els.deckForm.reset();els.deckDialog.showModal();setTimeout(()=>els.deckNameInput.focus(),30);}
function renameCurrentDeck(){const deck=currentDeck();if(!deck)return;els.renameDeckInput.value=deck.name;els.renameDialog.showModal();setTimeout(()=>els.renameDeckInput.select(),30);}
function deleteCurrentDeck(){const deck=currentDeck();if(!deck)return;if(!confirm(`“${deck.name}” 단어장과 학습 기록을 삭제할까요?\n이 작업은 되돌릴 수 없어요.`))return;state.decks=state.decks.filter(item=>item.id!==deck.id);state.currentDeckId=null;save();showView('garage');toast('단어장을 삭제했어요.');}
async function readCsvFile(file,targetDeckId=null){
  if(!file)return;try{const text=await file.text();const words=parseCsv(text).map(newWordRecord);if(!words.length)throw new Error('English,Korean 열이 있는 파일인지 확인해 주세요.');state.importWords=words;state.importTargetDeckId=targetDeckId;const target=state.decks.find(deck=>deck.id===targetDeckId);els.importDeckName.value=target?.name||file.name.replace(/\.csv$/i,'');els.importDeckName.closest('label').classList.toggle('hidden',Boolean(target));els.importDialogTitle.textContent=target?'단어 추가 확인':'단어장 확인';els.importConfirmBtn.textContent=target?'중복 제외하고 단어 추가':'이 단어장 만들기';els.importSummary.textContent=`${words.length}개의 단어를 찾았어요. 아래 미리보기를 확인해 주세요.`;els.importPreview.innerHTML=words.slice(0,12).map(w=>`<div><b>${escapeHtml(w.english)}</b><span>${escapeHtml(w.korean)}</span></div>`).join('')+(words.length>12?`<div><b>외 ${words.length-12}개</b><span>단어가 더 있어요.</span></div>`:'');els.importDialog.showModal();}catch(error){toast(error.message);}finally{els.csvInput.value='';els.appendCsvInput.value='';}}
function takeCsvMakerTransfer(){
  if(new URLSearchParams(location.search).get('import')!=='csv-maker')return false;
  let payload;
  try{payload=JSON.parse(localStorage.getItem(CSV_MAKER_TRANSFER_KEY)||'null');}catch{}
  localStorage.removeItem(CSV_MAKER_TRANSFER_KEY);
  history.replaceState(null,'',location.pathname+location.hash);
  pendingCsvMakerTransfer=payload||null;
  return Boolean(pendingCsvMakerTransfer);
}
function applyCsvMakerTransfer(){
  const payload=pendingCsvMakerTransfer;
  pendingCsvMakerTransfer=null;
  if(!payload?.csv){toast('가져올 단어장을 찾지 못했어요.');return false;}
  try{
    const words=parseCsv(payload.csv).map(newWordRecord);
    if(!words.length)throw new Error('가져올 단어가 없어요.');
    const d={id:uid(),name:String(payload.title||'사진 단어장').trim().slice(0,30)||'사진 단어장',createdAt:new Date().toISOString(),words};
    state.decks.unshift(d);state.currentDeckId=d.id;save();showView('deck');toast(`${words.length}개 단어를 바로 적용했어요.`);return true;
  }catch(error){toast(error.message);return false;}
}
function openWordDialog(word=null){els.wordForm.reset();els.editingWordId.value=word?.id||'';els.englishInput.value=word?.english||'';els.koreanInput.value=word?.korean||'';els.wordDialogTitle.textContent=word?'단어 고치기':'단어 싣기';els.wordForm.querySelector('.primary-btn').textContent=word?'수정 완료':'저장하고 다음 단어';$('finishAddingBtn').classList.toggle('hidden',Boolean(word));els.wordDialog.showModal();setTimeout(()=>els.englishInput.focus(),30);}
function storeWord(close=false){
  if(!els.wordForm.reportValidity())return false;const d=currentDeck(),editing=d.words.find(w=>w.id===els.editingWordId.value);if(editing){editing.english=els.englishInput.value.trim();editing.korean=els.koreanInput.value.trim();}else d.words.push(newWordRecord({english:els.englishInput.value.trim(),korean:els.koreanInput.value.trim()}));save();renderDeck();if(close||editing){els.wordDialog.close();toast(editing?'단어를 수정했어요.':'단어를 실었어요.');}else{els.wordForm.reset();els.englishInput.focus();toast('단어를 싣고 다음 칸을 열었어요.');}return true;
}
function deleteWord(id){const deck=currentDeck(),word=deck?.words.find(item=>item.id===id);if(!deck||!word)return;if(!confirm(`“${word.english}” 단어를 삭제할까요?`))return;deck.words=deck.words.filter(item=>item.id!==id);save();renderDeck();toast('단어를 삭제했어요.');}
function startGame(mode, words=null){const d=currentDeck();const source=words||d.words;if(!source.length){toast('게임을 시작하려면 단어를 먼저 추가해 주세요.');return;}state.game={mode,queue:shuffle(source),index:0,correct:0,wrong:[],answered:false,revealed:false};showView('game');els.gameModeLabel.textContent=MODE_META[mode]?.drive||'';els.gameTitle.textContent=d.name;renderQuestion();}
function renderQuestion(){const g=state.game,w=g.queue[g.index],total=g.queue.length,pct=total>1?g.index/(total-1)*100:0;g.answered=false;g.revealed=false;els.gameCounter.textContent=`${g.index+1} / ${total}`;els.route.setAttribute('aria-valuemax',total);els.route.setAttribute('aria-valuenow',g.index+1);els.route.setAttribute('aria-valuetext',`전체 ${total}개 중 ${g.index+1}번째 단어`);const normalized=normalizeEnglish(w.english),matches=[...state.decks].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).flatMap(deck=>deck.words).filter(word=>normalizeEnglish(word.english)===normalized),duplicateOrder=matches.findIndex(word=>word.id===w.id)+1,duplicateLabel=matches.length>1&&duplicateOrder>1?` · 중복 ${duplicateOrder}번째`:'';els.wordRegistryLabel.textContent=`MY WORD #${String(w.registryNo||registryNumber(w.english)).padStart(4,'0')}${duplicateLabel}`;els.routeFill.style.width=`${pct}%`;els.routeCar.style.left=`${pct}%`;els.promptLabel.textContent=MODE_META[g.mode]?.prompt||'';els.promptText.textContent=g.mode==='ko-en'?w.korean:w.english;els.promptText.classList.toggle('card-front',g.mode==='card');els.answerForm.classList.toggle('hidden',g.mode==='card');els.cardControls.classList.toggle('hidden',g.mode!=='card');els.cardRevealBtn.classList.toggle('hidden',g.mode!=='card');els.cardMarkActions.classList.add('hidden');els.cardKnownBtn.disabled=false;els.cardUnknownBtn.disabled=false;els.answerLabel.textContent=g.mode==='en-ko'?'한글 뜻':'영어 스펠링';els.answerInput.placeholder=g.mode==='en-ko'?'뜻을 입력하세요':'스펠링을 입력하세요';els.answerInput.value='';els.answerInput.disabled=false;els.answerForm.querySelector('button').disabled=false;els.feedback.className='feedback hidden';els.nextBtn.classList.add('hidden');els.speakBtn.classList.toggle('hidden',g.mode==='ko-en');if(g.mode==='card')setTimeout(()=>els.cardRevealBtn.focus(),40);else setTimeout(()=>els.answerInput.focus(),40);}
function recordAttempt(word,correct){const g=state.game,key=MODE_META[g.mode].key,stats=ensureWordStats(word);stats[key].attempts++;if(correct)stats[key].correct++;word.attempts=(word.attempts||0)+1;if(correct)word.correct=(word.correct||0)+1;if(correct)g.correct++;else g.wrong.push(word);}
function checkAnswer(){const g=state.game;if(g.answered)return;const value=els.answerInput.value;if(!value.trim()){toast('답을 먼저 입력해 주세요.');return;}const w=g.queue[g.index],expected=g.mode==='en-ko'?w.korean:w.english;const answers=g.mode==='en-ko'?koreanAnswerCandidates(expected):[normalizeEnglish(expected)];const mine=g.mode==='en-ko'?normalizeKorean(value):normalizeEnglish(value);const correct=answers.includes(mine);g.answered=true;recordAttempt(w,correct);save();els.feedback.className=`feedback ${correct?'correct':'wrong'}`;els.feedback.innerHTML=correct?`<b>정답!</b> 그대로 다음 코스로 달려요.`:`<b>아쉬워요.</b> 정답은 <strong>${escapeHtml(expected)}</strong>예요.`;els.answerInput.disabled=true;els.answerForm.querySelector('button').disabled=true;els.nextBtn.textContent=g.index===g.queue.length-1?'결과 보기 →':'다음 단어 →';els.nextBtn.classList.remove('hidden');els.nextBtn.focus();}
function revealCard(){const g=state.game;if(g.mode!=='card'||g.revealed||g.answered)return;const w=g.queue[g.index];g.revealed=true;els.promptText.textContent=w.korean;els.promptText.classList.remove('card-front');els.promptLabel.textContent='외웠으면 O, 아직이면 X를 누르세요.';els.cardRevealBtn.classList.add('hidden');els.cardMarkActions.classList.remove('hidden');els.feedback.className='feedback hidden';els.cardKnownBtn.focus();}
function markCard(correct){const g=state.game;if(g.mode!=='card'||g.answered)return;if(!g.revealed)revealCard();const w=g.queue[g.index];g.answered=true;recordAttempt(w,correct);save();els.feedback.className=`feedback ${correct?'correct':'wrong'}`;els.feedback.innerHTML=correct?`<b>외움!</b> 다음 카드로 넘어가요.`:`<b>못외움.</b> 이 단어는 다시 달려 볼게요.`;els.cardKnownBtn.disabled=true;els.cardUnknownBtn.disabled=true;els.nextBtn.textContent=g.index===g.queue.length-1?'결과 보기 →':'다음 단어 →';els.nextBtn.classList.remove('hidden');els.nextBtn.focus();}
function nextQuestion(){const g=state.game;if(g.index<g.queue.length-1){g.index++;renderQuestion();}else finishGame();}
function finishGame(){const g=state.game,total=g.queue.length,rate=Math.round(g.correct/total*100);els.resultScore.textContent=`${g.correct} / ${total}`;els.resultRate.textContent=`${rate}%`;els.resultMessage.textContent=rate===100?'모든 단어를 정확히 배송했어요!':rate>=70?'거의 다 왔어요. 틀린 단어만 한 번 더 달려 볼까요?':'천천히 다시 달리면 길이 익숙해질 거예요.';els.retryWrongBtn.classList.toggle('hidden',!g.wrong.length);showView('result');}
function preferredEnglishVoice(){const voices=speechSynthesis.getVoices(),preferred=['Samantha','Aaron','Alex'];for(const name of preferred){const voice=voices.find(item=>item.name.toLowerCase().includes(name.toLowerCase())&&item.lang.toLowerCase().startsWith('en'));if(voice)return voice;}return voices.find(item=>/^en[-_]us$/i.test(item.lang))||voices.find(item=>item.lang.toLowerCase().startsWith('en'))||null;}
function speak(){const w=state.game?.queue[state.game.index];if(!w||!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(w.english),voice=preferredEnglishVoice();u.lang='en-US';if(voice)u.voice=voice;u.rate=1;u.pitch=1;speechSynthesis.speak(u);}
let toastTimer;function toast(message){clearTimeout(toastTimer);els.toast.textContent=message;els.toast.classList.remove('hidden');toastTimer=setTimeout(()=>els.toast.classList.add('hidden'),2200);}

$('newDeckBtn').addEventListener('click',openDeckDialog);$('addWordBtn').addEventListener('click',()=>openWordDialog());
els.renameDeckBtn.addEventListener('click',renameCurrentDeck);els.deleteDeckBtn.addEventListener('click',deleteCurrentDeck);
els.renameForm.addEventListener('submit',e=>{e.preventDefault();if(!els.renameForm.reportValidity())return;const deck=currentDeck();if(!deck)return;deck.name=els.renameDeckInput.value.trim();save();els.renameDialog.close();renderDeck();toast('단어장 이름을 바꿨어요.');});
els.deckSearch.addEventListener('input',()=>{state.deckQuery=els.deckSearch.value;renderGarage();});
els.csvInput.addEventListener('change',()=>readCsvFile(els.csvInput.files[0]));els.appendCsvInput.addEventListener('change',()=>readCsvFile(els.appendCsvInput.files[0],state.currentDeckId));
els.importForm.addEventListener('submit',e=>{e.preventDefault();if(!state.importWords.length)return;if(state.importTargetDeckId){const deck=state.decks.find(item=>item.id===state.importTargetDeckId);if(!deck)return;const existing=new Set(deck.words.map(word=>normalizeEnglish(word.english)));const additions=state.importWords.filter(word=>!existing.has(normalizeEnglish(word.english)));deck.words.push(...additions);state.importWords=[];state.importTargetDeckId=null;save();els.importDialog.close();renderDeck();toast(`${additions.length}개 단어를 추가했어요.`);return;}if(!els.importForm.reportValidity())return;const d={id:uid(),name:els.importDeckName.value.trim(),createdAt:new Date().toISOString(),words:state.importWords};state.decks.unshift(d);state.currentDeckId=d.id;state.importWords=[];save();els.importDialog.close();showView('deck');toast('단어장을 차고에 넣었어요.');});
els.deckForm.addEventListener('submit',e=>{e.preventDefault();if(!els.deckForm.reportValidity())return;const d={id:uid(),name:els.deckNameInput.value.trim(),createdAt:new Date().toISOString(),words:[]};state.decks.unshift(d);state.currentDeckId=d.id;save();els.deckDialog.close();showView('deck');openWordDialog();});
els.wordForm.addEventListener('submit',e=>{e.preventDefault();storeWord(false);});$('finishAddingBtn').addEventListener('click',()=>storeWord(true));
els.deckGrid.addEventListener('click',e=>{const b=e.target.closest('[data-deck]');if(b){state.currentDeckId=b.dataset.deck;showView('deck');}});
els.wordList.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-word]'),del=e.target.closest('[data-delete-word]');if(edit)openWordDialog(currentDeck().words.find(w=>w.id===edit.dataset.editWord));if(del)deleteWord(del.dataset.deleteWord);});
document.addEventListener('click',e=>{const close=e.target.closest('[data-close-dialog]');if(close)close.closest('dialog')?.close();const go=e.target.closest('[data-go]');if(go)showView(go.dataset.go);const mode=e.target.closest('[data-mode]');if(mode)startGame(mode.dataset.mode);if(e.target.closest('[data-new-empty]'))openDeckDialog();});
els.answerForm.addEventListener('submit',e=>{e.preventDefault();checkAnswer();});els.nextBtn.addEventListener('click',nextQuestion);els.speakBtn.addEventListener('click',speak);els.cardRevealBtn.addEventListener('click',revealCard);els.promptText.addEventListener('click',()=>{if(state.game?.mode==='card')revealCard();});els.cardKnownBtn.addEventListener('click',()=>markCard(true));els.cardUnknownBtn.addEventListener('click',()=>markCard(false));$('quitGameBtn').addEventListener('click',()=>showView('deck'));els.retryWrongBtn.addEventListener('click',()=>startGame(state.game.mode,state.game.wrong));
const isIosDevice=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(isIosDevice&&!isStandalone){document.body.classList.add('ios-browser');els.installBtn.classList.remove('hidden');}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;els.installBtn.classList.remove('hidden');});
els.installBtn.addEventListener('click',async()=>{if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;els.installBtn.classList.add('hidden');return;}if(isIosDevice&&!isStandalone){els.installDialog.showModal();return;}toast('브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.');});
window.addEventListener('appinstalled',()=>{state.deferredInstall=null;els.installBtn.classList.add('hidden');});
if('serviceWorker'in navigator)window.addEventListener('load',async()=>{
  const hadController=Boolean(navigator.serviceWorker.controller);
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||refreshing)return;
    refreshing=true;
    location.reload();
  });
  try{
    const registration=await navigator.serviceWorker.register('sw.js');
    await registration.update();
    if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
  }catch{}
});
function renderAccount(){const user=state.cloudUser;els.authBtn.innerHTML=user?`<span>●</span> ${escapeHtml(user.name)} · 로그아웃`:'<span>●</span> 카카오 로그인';els.syncBadge.textContent=user?'동기화됨':'기기 저장';els.syncBadge.className=`sync-badge ${user?'synced':''}`;}
function applyCloudData(remote){if(!remote?.decks)return;state.decks=remote.decks;state.registry=remote.registry;ensureRegistryNumbers();save(false);if(state.view==='garage')renderGarage();if(state.view==='deck')renderDeck();}
function openSyncDecision(result){state.pendingSyncDecision=result;const migration=result.kind==='migration-choice';els.syncDecisionTitle.textContent=migration?'기기 단어장과 클라우드 단어장이 모두 있어요':'다른 기기에서 단어장이 바뀌었어요';els.syncDecisionCopy.textContent=migration?`이 기기 ${state.decks.length}개, 클라우드 ${result.remote.decks.length}개 단어장이 있습니다. 어느 내용을 사용할지 선택해 주세요.`:`클라우드에 ${result.remote.decks.length}개 단어장이 있습니다. 선택하지 않으면 현재 기기 내용은 서버에 덮어쓰지 않습니다.`;els.syncUseRemoteBtn.textContent='클라우드 단어장 불러오기';els.syncKeepLocalBtn.textContent='이 기기 단어장 저장';els.syncDecisionDialog.showModal();els.syncBadge.textContent='동기화 선택 필요';els.syncBadge.className='sync-badge error';}
function handleSyncResult(result){if(!result)return;if(result.kind==='migration-choice'||result.kind==='conflict'){openSyncDecision(result);return;}applyCloudData(result);}
async function resolveSyncDecision(choice){const revision=authRevision;const pending=state.pendingSyncDecision;if(!pending)return;els.syncUseRemoteBtn.disabled=true;els.syncKeepLocalBtn.disabled=true;try{const result=await RoVoCloud.resolveDataChoice(choice,state.decks,state.registry,pending.remote);if(revision!==authRevision)return;if(result)applyCloudData(result);state.pendingSyncDecision=null;els.syncDecisionDialog.close();els.syncBadge.textContent='동기화됨';els.syncBadge.className='sync-badge synced';}catch(error){if(revision===authRevision)toast(`동기화하지 못했어요: ${error.message}`);}finally{els.syncUseRemoteBtn.disabled=false;els.syncKeepLocalBtn.disabled=false;}}
let authRevision = 0;
async function handleAuth(user) {
  const previous = state.cloudUser;
  if (previous?.id === user?.id && !pendingCsvMakerTransfer) return;
  const revision = ++authRevision;
  const isCurrent = () => revision === authRevision && state.cloudUser?.id === user?.id;
  state.cloudUser = user;
  if (state.pendingSyncDecision) { state.pendingSyncDecision = null; els.syncDecisionDialog.close(); }
  let changedDuringSync = false, importedDuringAuth = false;
  if (user) {
    const userKey = `${STORAGE_KEY}:${user.id}`, registryKey = `${REGISTRY_KEY}:${user.id}`;
    const guestDecks = state.decks, guestRegistry = state.registry;
    state.storageKey = userKey;
    state.registryKey = registryKey;
    if (!loadFromStorage(userKey)) {
      state.decks = previous ? [] : guestDecks;
      state.registry = previous ? {} : guestRegistry;
      ensureRegistryNumbers();
    }
    if (pendingCsvMakerTransfer) importedDuringAuth = applyCsvMakerTransfer();
    const versionBeforeSync = state.dataVersion;
    try {
      let result = importedDuringAuth ? await RoVoCloud.sync(state.decks, state.registry, { forcePush: true }) : await RoVoCloud.sync(state.decks, state.registry);
      if (!isCurrent()) return;
      changedDuringSync = versionBeforeSync !== state.dataVersion;
      if (changedDuringSync && !importedDuringAuth) {
        result = await RoVoCloud.flush(state.decks, state.registry);
        if (!isCurrent()) return;
      }
      handleSyncResult(result);
      save(false);
    } catch (error) {
      if (!isCurrent()) return;
      toast(`동기화하지 못했어요: ${error.message}`);
    }
  } else if (previous) {
    state.storageKey = STORAGE_KEY;
    state.registryKey = REGISTRY_KEY;
    state.decks = [];
    state.registry = {};
    await loadData();
    if (!isCurrent()) return;
  }
  renderAccount();
  if (!changedDuringSync && !importedDuringAuth) {
    state.currentDeckId = null;
    showView('garage');
  }
}
window.addEventListener('rovocar-cloud',event=>{const detail=event.detail;if(detail.type==='auth')handleAuth(detail.user);if(detail.type==='syncing'){els.syncBadge.textContent='동기화 중';els.syncBadge.className='sync-badge syncing';}if(detail.type==='synced'){els.syncBadge.textContent='동기화됨';els.syncBadge.className='sync-badge synced';}if(detail.type==='offline'){els.syncBadge.textContent='오프라인 저장';els.syncBadge.className='sync-badge';}if(detail.type==='error'){els.syncBadge.textContent='동기화 대기';els.syncBadge.className='sync-badge error';}if(detail.type==='online'&&state.cloudUser)RoVoCloud.sync(state.decks,state.registry).then(handleSyncResult).catch(()=>{});});
els.syncUseRemoteBtn.addEventListener('click',()=>resolveSyncDecision('remote'));els.syncKeepLocalBtn.addEventListener('click',()=>resolveSyncDecision('local'));
els.authBtn.addEventListener('click',async()=>{const revision=authRevision;try{if(state.cloudUser){clearTimeout(cloudSyncTimer);els.authBtn.disabled=true;const result=await RoVoCloud.flush(state.decks,state.registry);if(revision!==authRevision)return;if(result?.kind){handleSyncResult(result);toast('동기화 내용을 선택한 뒤 로그아웃해 주세요.');return;}handleSyncResult(result);await RoVoCloud.signOut();}else await RoVoCloud.signIn();}catch(error){toast(error.message);}finally{els.authBtn.disabled=false;}});
loadData().then(async()=>{takeCsvMakerTransfer();renderGarage();renderAccount();if(window.RoVoCloud)await RoVoCloud.init();if(pendingCsvMakerTransfer&&!state.cloudUser)applyCsvMakerTransfer();});
