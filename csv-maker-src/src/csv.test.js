import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cleanRows, createCsv, safeFilename } from './csv.js';

const rovocarCore = new URL('../../RoVoCa_PWA/core.mjs', import.meta.url);

test('RoVoCar CSV uses its exact header and RFC 4180 escaping', () => {
  const csv = createCsv([
    { english: 'apple', korean: '사과' },
    { english: 'right, correct', korean: '옳은' },
    { english: 'say "hello"', korean: '인사\n말' },
  ]);
  assert.equal(csv, 'English,Korean\r\napple,사과\r\n"right, correct",옳은\r\n"say ""hello""","인사\n말"\r\n');
});

test('empty rows are removed before download', () => {
  assert.deepEqual(cleanRows([
    { english: ' take care of ', korean: ' 돌보다 ' },
    { english: '', korean: '뜻 없음' },
    { english: 'word', korean: ' ' },
  ]), [{ english: 'take care of', korean: '돌보다' }]);
});

test('filename stays safe while retaining Korean titles', () => {
  assert.equal(safeFilename('  7월 / 단어장? ', new Date('2026-07-19T12:00:00Z')), 'rovocar-7월-단어장-2026-07-19.csv');
});

test('generated CSV round-trips through the current RoVoCar parser', { skip: !existsSync(rovocarCore) }, async () => {
  const { parseCsv } = await import(rovocarCore.href);
  const imported = parseCsv(createCsv([
    { english: 'take care of', korean: '돌보다' },
    { english: 'right, correct', korean: '옳은' },
    { english: 'say "hello"', korean: '인사\n말' },
    { english: 'involve', korean: '수반하다, 포함하다' },
  ]));
  assert.deepEqual(imported, [
    { english: 'take care of', korean: '돌보다' },
    { english: 'right, correct', korean: '옳은' },
    { english: 'say "hello"', korean: '인사\n말' },
    { english: 'involve', korean: '수반하다, 포함하다' },
  ]);
});
