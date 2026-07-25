import test from 'node:test';
import assert from 'node:assert/strict';
import { base64ByteLength, isSupportedImagePayload, validateExtraction } from './extraction.js';

const valid = { items: [{ english: ' take care of ', korean: ' 돌보다 ', confidence: 'high', note: null }], warnings: ['사진 하단을 확인하세요.'] };

test('extraction contracts trim valid values without inventing content', () => {
  assert.deepEqual(validateExtraction(valid), { items: [{ english: 'take care of', korean: '돌보다', confidence: 'high', note: null }], warnings: ['사진 하단을 확인하세요.'] });
});

test('extraction contract rejects malformed or oversized model responses', () => {
  assert.equal(validateExtraction({ ...valid, items: [{ ...valid.items[0], confidence: 'maybe' }] }), null);
  assert.equal(validateExtraction({ ...valid, items: [{ ...valid.items[0], note: undefined }] }), null);
  assert.equal(validateExtraction({ ...valid, warnings: 'not an array' }), null);
  assert.equal(validateExtraction({ ...valid, items: Array.from({ length: 151 }, () => valid.items[0]) }), null);
});

test('a typical 80-pair vocabulary photo is retained in full', () => {
  const eightyRows = Array.from({ length: 80 }, (_unused, index) => ({ english: `word ${index + 1}`, korean: `뜻 ${index + 1}`, confidence: 'high', note: null }));
  assert.equal(validateExtraction({ items: eightyRows, warnings: [] })?.items.length, 80);
});

test('image payload validation accepts only bounded supported base64 images', () => {
  assert.equal(base64ByteLength('YWJjZA=='), 4);
  assert.equal(isSupportedImagePayload({ mimeType: 'image/jpeg', data: 'YWJjZA==' }, 4), true);
  assert.equal(isSupportedImagePayload({ mimeType: 'image/heic', data: 'YWJjZA==' }, 4), false);
  assert.equal(isSupportedImagePayload({ mimeType: 'image/png', data: 'data:image/png;base64,YWJj' }, 100), false);
  assert.equal(isSupportedImagePayload({ mimeType: 'image/png', data: 'YWJjZA==' }, 2), false);
});
