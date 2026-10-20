import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Test the deployed code, replacing only the external service boundary.
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/extract-vocabulary/index.ts', import.meta.url), 'utf8').replace(/^import .*createClient.*;$/m, ''));
function edge(fetch, timer = {}) {
  const context = vm.createContext({ fetch, Response, URL, AbortController, setTimeout, clearTimeout, console, Deno: { env: { get: () => 'test-key' }, serve() {} }, ...timer });
  vm.runInContext(source, context);
  return (expression) => vm.runInContext(expression, context);
}
const model = (name) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] });

test('OCR specifies vocabulary field names through the response schema', async () => {
  let body;
  const run = edge(async (_url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.6-flash')] });
    body = JSON.parse(options.body);
    return Response.json({ candidates: [] });
  });
  await run("requestGemini('image/png', 'YWJj')");
  assert.equal(body.generationConfig.responseFormat?.text.mimeType, 'APPLICATION_JSON');
  // The production API rejected maxItems: 150; the server still validates the limit.
  assert.equal(body.generationConfig.responseFormat.text.schema.properties.items.maxItems, undefined);
  assert.deepEqual(body.generationConfig.responseFormat?.text.schema?.required, ['items', 'warnings']);
  assert.deepEqual(body.generationConfig.responseFormat?.text.schema?.properties.items.items.required, ['english', 'korean', 'confidence', 'note']);
});

test('discovery failure preserves the API status without guessing a model', async () => {
  let generations = 0;
  const run = edge(async (_url, options) => {
    if (options.method === 'POST') generations++;
    return Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 });
  });
  assert.equal((await run("requestGemini('image/png', 'YWJj')")).status, 403);
  assert.equal(generations, 0);
});

test('discovery follows pagination and accepts available Flash models', async () => {
  const run = edge(async (url) => new URL(url).searchParams.has('pageToken')
    ? Response.json({ models: [model('gemini-2.5-flash')] })
    : Response.json({ models: [], nextPageToken: 'next' }));
  assert.equal(await run("resolveGeminiModel('test-key')"), 'models/gemini-2.5-flash');
});

test('no usable Flash model returns unavailable without making an OCR request', async () => {
  let generations = 0;
  const run = edge(async (_url, options) => {
    if (options.method === 'POST') generations++;
    return Response.json({ models: [model('gemini-3-flash-image'), model('gemini-3-flash-live')] });
  });
  assert.equal((await run("requestGemini('image/png', 'YWJj')")).status, 503);
  assert.equal(generations, 0);
});

test('a retired model is rediscovered and retried once', async () => {
  let discoveries = 0;
  const generated = [];
  const run = edge(async (url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model(++discoveries === 1 ? 'gemini-3.6-flash' : 'gemini-3.8-flash')] });
    generated.push(url);
    return Response.json({}, { status: generated.length === 1 ? 404 : 200 });
  });
  assert.equal((await run("requestGemini('image/png', 'YWJj')")).status, 200);
  assert.equal(discoveries, 2);
  assert.match(generated[1], /gemini-3.8-flash:generateContent$/);
});

test('quota errors are returned without retries', async () => {
  let generations = 0;
  const run = edge(async (_url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash')] });
    generations++;
    return Response.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
  });
  assert.equal((await run("requestGemini('image/png', 'YWJj')")).status, 429);
  assert.equal(generations, 1);
});

test('stable Flash is preferred over preview and Lite models', async () => {
  const run = edge(async () => Response.json({ models: [
    model('gemini-4-flash-preview'), model('gemini-4-flash-lite'), model('gemini-3.8-flash'), model('gemini-3.6-flash'),
  ] }));
  assert.equal(await run("resolveGeminiModel('test-key')"), 'models/gemini-3.8-flash');
});

test('503 high demand retries once on another available Flash model', async () => {
  const generated = [];
  const run = edge(async (url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash'), model('gemini-3.6-flash')] });
    generated.push(url);
    return Response.json({}, { status: generated.length === 1 ? 503 : 200 });
  });
  assert.equal((await run("requestGemini('image/png', 'YWJj')")).status, 200);
  assert.equal(generated.length, 2);
  assert.match(generated[1], /gemini-3.6-flash:generateContent$/);
});

test('OCR selects versioned Gemini Flash rather than the Omni family', async () => {
  const run = edge(async () => Response.json({ models: [model('gemini-omni-1.1-flash'), model('gemini-3.8-flash')] }));
  assert.equal(await run("resolveGeminiModel('test-key')"), 'models/gemini-3.8-flash');
});


test('vocabulary OCR minimizes reasoning on Gemini 3 to leave time for all rows', async () => {
  let config;
  const run = edge(async (_url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash')] });
    config = JSON.parse(options.body).generationConfig;
    return Response.json({});
  });
  await run("requestGemini('image/png', 'YWJj')");
  assert.equal(config.thinkingConfig?.thinkingLevel, 'MINIMAL');
});

test('an 80-row response completing after 40 seconds fits within the request deadline', async () => {
  let deadline;
  const rows = Array.from({length:80},(_,i)=>({english:`word${i}`,korean:`meaning${i}`}));
  const run = edge(async (_url, options) => {
    if (options.method !== 'POST') return Response.json({ models: [model('gemini-3.8-flash')] });
    if (deadline <= 40_000) throw new DOMException('deadline reached','AbortError');
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({items:rows,warnings:[]})}]}}]});
  }, {setTimeout(_fn,ms){deadline=ms;return 1;},clearTimeout(){}});
  const response = await run("requestGemini('image/png', 'YWJj')");
  assert.equal(response.status,200);
  assert.equal(JSON.parse((await response.json()).candidates[0].content.parts[0].text).items.length,80);
});
