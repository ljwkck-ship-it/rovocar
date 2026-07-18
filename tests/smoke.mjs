import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const required = ['index.html','styles.css','core.mjs','app.js','cloud.js','admin.html','admin.css','admin.js','supabase-config.js','supabase/schema.sql','sw.js','manifest.webmanifest','assets/rovocar.svg','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png','data/default.csv'];
const contents = Object.fromEntries(await Promise.all(required.map(async file => [file, await readFile(new URL(`../${file}`, import.meta.url), file.endsWith('.png') ? null : 'utf8')])));

assert.match(contents['index.html'], /id="garageView"/);
assert.match(contents['index.html'], /data-mode="en-ko"/);
assert.match(contents['index.html'], /data-mode="ko-en"/);
assert.match(contents['index.html'], /id="csvInput"/);
assert.match(contents['app.js'], /localStorage/);
assert.match(contents['app.js'], /registryNo/);
assert.match(contents['app.js'], /deleteCurrentDeck/);
assert.match(contents['app.js'], /importTargetDeckId/);
assert.match(contents['app.js'], /syncDecisionDialog/);
assert.match(contents['cloud.js'], /migration-choice/);
assert.match(contents['cloud.js'], /remoteChanged/);
assert.match(contents['supabase/schema.sql'], /enable row level security/);
assert.match(contents['supabase/schema.sql'], /is_rovocar_admin/);
assert.doesNotMatch(contents['supabase-config.js'], /service_role|sb_secret_/i);
assert.match(contents['app.js'], /serviceWorker\.register/);
assert.match(contents['sw.js'], /data\/default\.csv/);

const manifest = JSON.parse(contents['manifest.webmanifest']);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.short_name, 'RoVoCar');

const csvLines = contents['data/default.csv'].trim().split(/\r?\n/);
assert.equal(csvLines[0], 'English,Korean');
assert.equal(csvLines.length - 1, 80);
const englishWords = csvLines.slice(1).map(line => line.match(/^([^,]+)/)?.[1]);
assert.equal(new Set(englishWords).size, 80, '영어 단어가 중복되었습니다.');
assert.ok(englishWords.every(word => /^[a-z][a-z -]*$/i.test(word)), '영어 열 형식을 확인하세요.');

console.log('RoVoCar smoke test passed: PWA files, two game modes, CSV import, reference data');

function parseCsv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'&&quoted&&next==='"'){field+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
  if(field||row.length){row.push(field);rows.push(row);} return rows;
}

const sampleDir = new URL('../_local/samples/english-vocabulary/', import.meta.url);
let sampleFiles=[];
try { sampleFiles=(await readdir(sampleDir)).filter(name => name.endsWith('.csv')).sort(); } catch {}
for (const file of sampleFiles) {
  const rows = parseCsv(await readFile(new URL(file, sampleDir), 'utf8'));
  assert.deepEqual(rows[0], ['English','Korean'], `${file}: 헤더가 올바르지 않습니다.`);
  assert.equal(rows.length - 1, 80, `${file}: 단어가 80개여야 합니다.`);
  assert.ok(rows.slice(1).every(row => row.length >= 2 && row[0].trim() && row.slice(1).some(value => value.trim())), `${file}: 비어 있는 행이 있습니다.`);
}
console.log(sampleFiles.length?`Private CSV samples passed: ${sampleFiles.length} files × 80 words`:'Private CSV samples skipped: _local folder is not included in Git.');
