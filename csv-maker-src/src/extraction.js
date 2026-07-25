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
  if (!value || typeof value !== 'object' || !Array.isArray(value.items) || value.items.length > MAX_EXTRACTION_ITEMS) return null;
  const items = [];
  for (const item of value.items) {
    if (!item || typeof item !== 'object') return null;
    const english = text(item.english);
    const korean = text(item.korean);
    const note = item.note === null ? null : text(item.note);
    if (english === null || korean === null || (item.confidence !== 'high' && item.confidence !== 'low') || (note === null && item.note !== null)) return null;
    items.push({ english, korean, confidence: item.confidence, note });
  }
  if (!Array.isArray(value.warnings)) return null;
  const warnings = value.warnings.map(text).filter((warning) => warning !== null).slice(0, 20);
  return { items, warnings };
}
