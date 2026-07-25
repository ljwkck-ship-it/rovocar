export const MAX_EXTRACTION_ITEMS = 150;
export const MAX_EXTRACTION_TEXT_LENGTH = 300;
export const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function base64ByteLength(data) {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

export function isSupportedImagePayload(image, maxBytes) {
  if (!image || typeof image !== 'object' || !SUPPORTED_IMAGE_TYPES.has(image.mimeType) || typeof image.data !== 'string') return false;
  // Base64 accepts only the standard alphabet; rejecting whitespace and data URLs
  // prevents a browser-supplied filename or URL from becoming server input.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return false;
  return base64ByteLength(image.data) <= maxBytes;
}

function text(value) {
  return typeof value === 'string' && value.trim().length <= MAX_EXTRACTION_TEXT_LENGTH ? value.trim() : null;
}

export function validateExtraction(value) {
  const source = Array.isArray(value) ? { items: value, warnings: [] } : value;
  if (!source || typeof source !== 'object' || !Array.isArray(source.items) || source.items.length > MAX_EXTRACTION_ITEMS) return null;
  const items = [];
  for (const item of source.items) {
    if (!item || typeof item !== 'object') return null;
    const english = text(item.english);
    const korean = text(item.korean);
    const confidence = item.confidence === 'low' ? 'low' : 'high';
    const note = item.note == null ? null : text(item.note);
    if (english === null || korean === null || (note === null && item.note != null)) return null;
    items.push({ english, korean, confidence, note });
  }
  if (source.warnings !== undefined && !Array.isArray(source.warnings)) return null;
  const warnings = (source.warnings ?? []).map(text).filter((warning) => warning !== null).slice(0, 20);
  return { items, warnings };
}

export function parseGeminiJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {}
  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  if (firstArray >= 0 && (firstObject < 0 || firstArray < firstObject)) {
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayEnd <= firstArray) return null;
    try {
      return JSON.parse(trimmed.slice(firstArray, arrayEnd + 1));
    } catch {
      return null;
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
}
