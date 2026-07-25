import { createClient } from 'npm:@supabase/supabase-js@2';

// Deliberately self-contained: Supabase Dashboard's browser editor deploys
// this entry file, while the matching browser-safe rules are unit-tested in
// src/extraction.js.
const MAX_EXTRACTION_ITEMS = 150;
const MAX_EXTRACTION_TEXT_LENGTH = 300;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let selectedGeminiModel: string | null = null;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
};

function origins() { return (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean); }
function cors(origin: string | null) {
  const allowed = origin && origins().includes(origin) ? origin : '';
  return { ...JSON_HEADERS, ...(allowed ? { 'access-control-allow-origin': allowed, vary: 'Origin' } : {}) };
}
function reply(origin: string | null, status: number, body: Record<string, unknown>) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
function asPositiveInt(name: string) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`invalid ${name}`);
  return parsed;
}
function base64ByteLength(data: string) {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}
function isSupportedImagePayload(image: { mimeType?: unknown; data?: unknown }, maxBytes: number) {
  return typeof image.mimeType === 'string' && SUPPORTED_IMAGE_TYPES.has(image.mimeType) && typeof image.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data) && base64ByteLength(image.data) <= maxBytes;
}
function text(value: unknown) { return typeof value === 'string' && value.trim().length <= MAX_EXTRACTION_TEXT_LENGTH ? value.trim() : null; }
function validateExtraction(value: unknown) {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) return null;
  const source = value as { items: unknown[]; warnings?: unknown };
  if (source.items.length > MAX_EXTRACTION_ITEMS || !Array.isArray(source.warnings)) return null;
  const items = [];
  for (const item of source.items) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>; const english = text(record.english); const korean = text(record.korean); const note = record.note === null ? null : text(record.note);
    if (english === null || korean === null || (record.confidence !== 'high' && record.confidence !== 'low') || (note === null && record.note !== null)) return null;
    items.push({ english, korean, confidence: record.confidence, note });
  }
  return { items, warnings: source.warnings.map(text).filter((warning): warning is string => warning !== null).slice(0, 20) };
}
const responseSchema = {
  type: 'object', properties: {
    items: { type: 'array', maxItems: MAX_EXTRACTION_ITEMS, items: { type: 'object', properties: {
      english: { type: 'string' }, korean: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'low'] }, note: { type: ['string', 'null'] },
    }, required: ['english', 'korean', 'confidence', 'note'] } },
    warnings: { type: 'array', items: { type: 'string' } },
  }, required: ['items', 'warnings'],
};

const prompt = `사진에 실제로 읽히는 영어 단어 또는 구와 그에 대응하는 한글 뜻만 순서대로 추출하세요. 번호, 제목, 예문, 발음기호, 장식 문구는 제외하세요. 확신하지 못하면 추측하지 말고 confidence를 low로 하고 note에 짧게 이유를 쓰세요. 영어와 한글 뜻의 열을 바꾸지 마세요. JSON 스키마에 맞는 값만 반환하세요.`;

async function resolveGeminiModel(key: string) {
  if (selectedGeminiModel) return selectedGeminiModel;
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } });
  if (!response.ok) return 'models/gemini-2.5-flash';
  const { models = [] } = await response.json() as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
  const usable = models.filter((model) => typeof model.name === 'string' && Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'));
  const preferred = usable.find((model) => model.name === 'models/gemini-2.5-flash')
    ?? usable.find((model) => /flash/i.test(String(model.name)) && !/image/i.test(String(model.name)));
  selectedGeminiModel = String(preferred?.name ?? 'models/gemini-2.5-flash');
  return selectedGeminiModel;
}

async function requestGemini(mimeType: string, data: string) {
  const key = Deno.env.get('GEMINI_API_KEY_PRIMARY');
  if (!key) throw new Error('gemini key missing');
  const model = await resolveGeminiModel(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16384, temperature: 0 } }),
    });
  } finally { clearTimeout(timeout); }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: origin && origins().includes(origin) ? 204 : 403, headers: cors(origin) });
  if (request.method !== 'POST' || !origin || !origins().includes(origin)) return reply(origin, 403, { error: 'origin_not_allowed', message: '허용되지 않은 요청입니다.' });
  if (!request.headers.get('content-type')?.includes('application/json')) return reply(origin, 415, { error: 'invalid_request', message: '사진을 다시 선택해 주세요.' });
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > asPositiveInt('MAX_REQUEST_BYTES')) return reply(origin, 413, { error: 'image_too_large', message: '사진 파일이 너무 큽니다. 더 작은 사진으로 다시 선택해 주세요.' });
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return reply(origin, 401, { error: 'authentication_required', message: '다시 로그인해 주세요.' });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return reply(origin, 400, { error: 'invalid_request', message: '사진을 다시 선택해 주세요.' });
    const image = (body as { image?: { mimeType?: unknown; data?: unknown } }).image;
    const mimeType = image?.mimeType;
    const data = image?.data;
    const maxBytes = asPositiveInt('MAX_IMAGE_BYTES');
    if (!isSupportedImagePayload({ mimeType, data }, maxBytes)) {
      const estimatedBytes = typeof data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(data) ? base64ByteLength(data) : 0;
      return reply(origin, estimatedBytes > maxBytes ? 413 : 400, { error: estimatedBytes > maxBytes ? 'image_too_large' : 'unsupported_image', message: estimatedBytes > maxBytes ? '사진 파일이 너무 큽니다. 더 작은 사진으로 다시 선택해 주세요.' : 'JPEG, PNG 또는 WebP 사진을 다시 선택해 주세요.' });
    }

    const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey || !Deno.env.get('GEMINI_API_KEY_PRIMARY')) return reply(origin, 503, { error: 'server_configuration', message: '서버의 Gemini 설정을 확인해야 합니다.' });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(auth.slice(7));
    if (userError || !userData.user) return reply(origin, 401, { error: 'authentication_required', message: '다시 로그인해 주세요.' });
    const { data: quota, error: quotaError } = await admin.rpc('consume_ocr_quota', { p_user_id: userData.user.id, p_daily_limit: asPositiveInt('OCR_DAILY_LIMIT'), p_minute_limit: asPositiveInt('OCR_MINUTE_LIMIT') }).single();
    if (quotaError || !quota) throw new Error('quota check failed');
    if (!quota.allowed) return reply(origin, 429, { error: quota.reason === 'daily_limit' ? 'daily_limit' : 'rate_limit', message: quota.reason === 'daily_limit' ? '가족용 오늘 사용 횟수를 모두 썼어요. 내일 다시 시도해 주세요.' : '잠시 후 다시 시도해 주세요.' });

    const geminiResponse = await requestGemini(mimeType, data);
    if (!geminiResponse.ok) {
      const upstreamStatus = geminiResponse.status;
      console.error(JSON.stringify({ event: 'gemini_request_failed', status: upstreamStatus }));
      if (upstreamStatus === 401 || upstreamStatus === 403) return reply(origin, 502, { error: 'gemini_access_denied', message: 'Gemini API 키 설정을 확인해야 합니다.' });
      if (upstreamStatus === 429) return reply(origin, 429, { error: 'gemini_rate_limited', message: 'Gemini 무료 사용량에 도달했습니다. 잠시 뒤 다시 시도해 주세요.' });
      return reply(origin, 502, { error: 'extraction_unavailable', message: 'Gemini가 지금 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
    }
    const geminiPayload = await geminiResponse.json();
    const text = geminiPayload?.candidates?.[0]?.content?.parts?.find((part: { text?: unknown }) => typeof part.text === 'string')?.text;
    let parsed: unknown; try { parsed = JSON.parse(text); } catch { return reply(origin, 502, { error: 'invalid_extraction', message: '안전하게 표시할 수 없는 결과예요. 사진을 바꿔 다시 시도해 주세요.' }); }
    const result = validateExtraction(parsed);
    if (!result) return reply(origin, 502, { error: 'invalid_extraction', message: '안전하게 표시할 수 없는 결과예요. 사진을 바꿔 다시 시도해 주세요.' });
    return reply(origin, 200, result);
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    return reply(origin, 503, { error: isTimeout ? 'extraction_timeout' : 'temporarily_unavailable', message: isTimeout ? '시간이 걸리고 있어요. 잠시 뒤 다시 시도해 주세요.' : '지금은 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
  }
});
