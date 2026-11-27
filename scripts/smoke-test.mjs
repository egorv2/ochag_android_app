#!/usr/bin/env node
/**
 * Смоук-тест контракта бэкенда через same-origin прокси Vite (/api → FastAPI).
 * Запуск: npm run smoke   (нужны запущенные scripts/dev-backend.sh и npm run dev)
 *
 * Покрывает: /health, /v1/chat, источники, двухфазную отправку (draft → confirm → 409),
 * /v1/tts, /v1/voice (заголовки), /v1/actions/drafts и WS /v1/ws/voice.
 */
import assert from 'node:assert/strict';

const ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
const API_KEY = process.env.API_KEY || 'dev-key';
const SESSION = `smoke-${Date.now()}`;
const headers = { 'X-API-Key': API_KEY };

let passed = 0;
function ok(name, extra = '') {
  passed += 1;
  console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
}

async function json(path, options = {}) {
  const response = await fetch(`${ORIGIN}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, response };
}

async function main() {
  console.log(`Очаг smoke-test → ${ORIGIN} (session ${SESSION})\n`);

  const health = await json('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  ok('GET /health', `env=${health.body.env}`);

  const ready = await json('/api/ready');
  assert.equal(ready.status, 200);
  ok('GET /ready', 'БД доступна');

  const search = await json('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `search-${SESSION}` },
    body: JSON.stringify({ session_id: SESSION, text: 'Сколько варить макароны?', locale: 'ru-RU' }),
  });
  assert.equal(search.status, 200);
  assert.ok(search.body.turn_id?.startsWith('turn_'));
  assert.ok(Array.isArray(search.body.sources) && search.body.sources.length > 0);
  ok('POST /v1/chat + Idempotency-Key', `источников: ${search.body.sources.length}, провайдер: ${search.body.provider}`);

  const cached = await json('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `search-${SESSION}` },
    body: JSON.stringify({ session_id: SESSION, text: 'Другой текст', locale: 'ru-RU' }),
  });
  assert.equal(cached.body.turn_id, search.body.turn_id);
  ok('Idempotency-Key возвращает сохранённый ответ');

  const draftResponse = await json('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION, text: 'Напиши маме, что я задерживаюсь на ужин', locale: 'ru-RU' }),
  });
  assert.equal(draftResponse.status, 200);
  const draft = draftResponse.body.draft;
  assert.ok(draft?.id && draft.confirm_token && draft.expires_at);
  ok('POST /v1/chat создаёт черновик', `${draft.channel} → ${draft.recipient_display}`);

  const drafts = await json(`/api/v1/actions/drafts?session_id=${encodeURIComponent(SESSION)}`);
  assert.equal(drafts.status, 200);
  assert.ok(drafts.body.some((item) => item.id === draft.id) === true);
  assert.equal(drafts.body.find((item) => item.id === draft.id).confirm_token, null);
  ok('GET /v1/actions/drafts', `записей: ${drafts.body.length}, токены не отдаются`);

  const confirm = await json(`/api/v1/actions/${draft.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_token: draft.confirm_token }),
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.status, 'sent');
  ok('POST /v1/actions/{id}/confirm', confirm.body.message);

  const repeat = await json(`/api/v1/actions/${draft.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_token: draft.confirm_token }),
  });
  assert.equal(repeat.status, 409);
  ok('Повторное подтверждение → 409');

  const badKey = await fetch(`${ORIGIN}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'wrong' },
    body: JSON.stringify({ session_id: SESSION, text: 'привет' }),
  });
  assert.equal(badKey.status, 401);
  ok('Неверный X-API-Key → 401');

  const tts = await fetch(`${ORIGIN}/api/v1/tts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Скажите, чем могу помочь?', format: 'mp3' }),
  });
  assert.equal(tts.status, 200);
  const ttsBytes = new Uint8Array(await tts.arrayBuffer());
  assert.ok(ttsBytes.length > 100);
  ok('POST /v1/tts', `${tts.headers.get('content-type')}, ${ttsBytes.length} байт`);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'audio/webm' }), 'audio.webm');
  form.append('session_id', SESSION);
  form.append('locale', 'ru-RU');
  const voice = await fetch(`${ORIGIN}/api/v1/voice`, { method: 'POST', headers, body: form });
  assert.equal(voice.status, 200);
  assert.ok(decodeURIComponent(voice.headers.get('x-transcript') || '').length > 0);
  assert.ok(decodeURIComponent(voice.headers.get('x-assistant-text') || '').length > 0);
  assert.ok((await voice.arrayBuffer()).byteLength > 100);
  ok('POST /v1/voice', 'аудио + URL-encoded X-Transcript / X-Assistant-Text');

  await websocketCheck();

  console.log(`\nГотово: ${passed} проверок пройдено.`);
}

async function websocketCheck() {
  const url = `${ORIGIN.replace(/^http/, 'ws')}/api/v1/ws/voice?session_id=${encodeURIComponent(SESSION + '-ws')}&token=${encodeURIComponent(API_KEY)}`;
  const events = [];
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('WS timeout: событие done не пришло за 20 с'));
    }, 20_000);

    socket.onopen = () => {
      // 100 мс тишины: PCM16 16 kHz mono = 3200 байт
      socket.send(new Uint8Array(3200).buffer);
      socket.send(JSON.stringify({ type: 'end' }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const payload = JSON.parse(event.data);
      events.push(payload.type);
      if (payload.type === 'done' || payload.type === 'error') {
        clearTimeout(timer);
        // Бэкенд может дослать хвостовой audio-чанк уже после done; приложение держит
        // соединение открытым, поэтому и тест закрывает его с небольшой задержкой.
        const failed = payload.type === 'error';
        const message = payload.message;
        setTimeout(() => {
          socket.close();
          failed ? reject(new Error(message)) : resolve();
        }, 500);
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error'));
    };
    socket.onclose = (event) => {
      if (events.length === 0) {
        clearTimeout(timer);
        reject(new Error(`WS закрыт до ответа: ${event.code} ${event.reason}`));
      }
    };
  });
  for (const expected of ['transcript', 'delta', 'answer', 'audio', 'done']) {
    assert.ok(events.includes(expected), `WS не прислал событие ${expected}`);
  }
  assert.ok(!events.includes('error'));
  ok('WS /v1/ws/voice (прокси) — полный turn', events.join(' → '));
}

main().catch((error) => {
  console.error(`\n✗ Смоук-тест упал: ${error.message}`);
  process.exit(1);
});
