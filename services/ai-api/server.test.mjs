import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantServer } from './server.mjs';

async function withServer(options, run) {
  const server = createAssistantServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const env = { OPENAI_API_KEY: 'test-secret', AI_ALLOWED_GOOGLE_EMAIL: 'writer@example.com', AI_ALLOWED_ORIGINS: 'https://scenario.example', AI_MODEL: 'test-model' };

test('origin and verified Google account are required; preflight is exact-origin only', async () => {
  const upstream = async (url, init) => {
    if (String(url).includes('userinfo')) {
      assert.equal(init.headers.Authorization, 'Bearer token');
      return Response.json({ email: 'writer@example.com', email_verified: true });
    }
    return Response.json({ output_text: 'ok' });
  };
  await withServer({ env, fetchImpl: upstream }, async base => {
    const wrongOrigin = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://attacker.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'summary', currentScene: 'scene' }) });
    assert.equal(wrongOrigin.status, 403);
    const wrongPreflight = await fetch(`${base}/v1/assist`, { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } });
    assert.equal(wrongPreflight.status, 403);
    const wrongUser = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'summary', currentScene: 'scene' }) });
    assert.equal(wrongUser.status, 200);
  });
});

test('allow-listed account sends only explicit context, disables response storage and returns no prompt', async () => {
  let requestBody;
  await withServer({ env, fetchImpl: async (url, init) => {
    if (String(url).includes('userinfo')) return Response.json({ email: 'writer@example.com', email_verified: true });
    requestBody = JSON.parse(init.body);
    return Response.json({ output_text: '提案文', usage: { input_tokens: 15, output_tokens: 3 } });
  } }, async base => {
    const response = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer short-lived-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: '推敲', selection: '選択した文', currentScene: '', references: [] }) });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.text, '提案文');
    assert.equal(result.usage.inputTokens, 15);
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.input.includes('選択した文'), true);
    assert.equal(requestBody.input.includes('他の未選択本文'), false);
    assert.equal(requestBody.max_output_tokens, 1200);
  });
});

test('rejects unverified identity without calling OpenAI', async () => {
  let openAiCalls = 0;
  await withServer({ env, fetchImpl: async url => {
    if (String(url).includes('userinfo')) return Response.json({ email: 'writer@example.com', email_verified: false });
    openAiCalls++;
    return Response.json({ output_text: 'no' });
  } }, async base => {
    const response = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: '推敲', currentScene: 'scene' }) });
    assert.equal(response.status, 403);
    assert.equal(openAiCalls, 0);
  });
});

test('rejects empty context and enforces per-hour request limits', async () => {
  let openAiCalls = 0;
  const fixedNow = Date.now();
  await withServer({ env, now: () => fixedNow, fetchImpl: async url => {
    if (String(url).includes('userinfo')) return Response.json({ email: 'writer@example.com', email_verified: true });
    openAiCalls++;
    return Response.json({ output_text: 'ok' });
  } }, async base => {
    const send = payload => fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const empty = await send({ task: '推敲', selection: '', currentScene: '', references: [] });
    assert.equal(empty.status, 400);
    for (let index = 0; index < 10; index++) assert.equal((await send({ task: 'summary', currentScene: 'scene' })).status, 200);
    assert.equal((await send({ task: 'summary', currentScene: 'scene' })).status, 429);
    assert.equal(openAiCalls, 10);
  });
});

test('rejects requests that exceed context limits', async () => {
  let openAiCalls = 0;
  await withServer({ env, fetchImpl: async url => {
    if (String(url).includes('userinfo')) return Response.json({ email: 'writer@example.com', email_verified: true });
    openAiCalls++;
    return Response.json({ output_text: 'no' });
  } }, async base => {
    const response = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: '推敲', currentScene: 'x'.repeat(49_000) }) });
    assert.equal(response.status, 413);
    assert.equal(openAiCalls, 0);
  });
});

test('times out the OpenAI request and returns a clear response without changing any document', async () => {
  await withServer({ env: { ...env, AI_TIMEOUT_MS: '10' }, fetchImpl: async (url, init) => {
    if (String(url).includes('userinfo')) return Response.json({ email: 'writer@example.com', email_verified: true });
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')), { once: true }));
  } }, async base => {
    const response = await fetch(`${base}/v1/assist`, { method: 'POST', headers: { Origin: 'https://scenario.example', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ task: '要約', currentScene: 'scene' }) });
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /時間切れ/);
  });
});
