export function cleanRows(rows) {
  return rows
    .map((row) => ({
      english: String(row.english ?? '').trim(),
      korean: String(row.korean ?? '').trim(),
    }))
    .filter((row) => row.english && row.korean);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

export function parseVocabularyCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const englishIndex = header.indexOf('english');
  const koreanIndex = header.indexOf('korean');
  if (englishIndex < 0 || koreanIndex < 0) return [];
  return cleanRows(rows.slice(1).map((row) => ({
    english: row[englishIndex],
    korean: row[koreanIndex],
  })));
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
