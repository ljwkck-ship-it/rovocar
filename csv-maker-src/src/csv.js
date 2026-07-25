export function cleanRows(rows) {
  return rows
    .map((row) => ({
      english: String(row.english ?? '').trim(),
      korean: String(row.korean ?? '').trim(),
    }))
    .filter((row) => row.english && row.korean);
}

export function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsv(rows) {
  const body = cleanRows(rows).map(({ english, korean }) =>
    `${escapeCsvCell(english)},${escapeCsvCell(korean)}`,
  );
  return ['English,Korean', ...body].join('\r\n') + '\r\n';
}

export function safeFilename(title, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  const clean = String(title || 'words')
    .trim()
    .replace(/[^a-zA-Z0-9가-힣 _-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `rovocar-${clean || 'words'}-${stamp}.csv`;
}

