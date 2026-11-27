# Архитектура клиента

Версия: 1.0 · Стек: React 18 + TypeScript + Vite 6 + Capacitor 6.

## 1. Границы

```text
┌────────────────────────────── Браузер / WebView ──────────────────────────────┐
│  UI (components/)  ←→  useAssistant (state machine)  ←→  lib/ (api, ws, audio) │
│                                    ↕                                           │
│                       localStorage: settings + history                         │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ /api/v1/*  (same-origin)
                    Vite proxy (dev) │  или прямой https://host (прод/Capacitor)
                                   ▼
                    FastAPI «Очаг»: /v1/chat, /v1/voice, /v1/ws/voice …
```

Клиент не знает о провайдерах LLM/STT/TTS и о БД бэкенда — только открытый контракт
`docs/API.md`. Все строки адресов формируются в `settings.ts` (`apiUrl`, `wsUrl`).

## 2. Слои

| Модуль | Ответственность |
| --- | --- |
| `lib/types.ts` | DTO и события WS в точности как `app/schemas.py` / `routes/voice.py`. |
| `lib/settings.ts` | `AppSettings`, генерация `session_id`, нормализация base URL, построение WS URL (`?session_id&token`), история без токенов. |
| `lib/api.ts` | Единая точка `fetch`: `X-API-Key`, `Idempotency-Key`, разбор `detail` FastAPI и человекочитаемые сообщения об ошибках; `/health`, `/ready`, `/v1/chat`, `/v1/stt`, `/v1/tts`, `/v1/voice`, drafts/confirm/cancel. |
| `lib/ws.ts` | Одно долгоживущее соединение на сессию: `connect()`, binary `sendAudio()`, `end(confirm_token?)`, `cancelTurn()`, `close()`. |
| `lib/audio.ts` | `PcmRecorder` (AudioWorklet + fallback ScriptProcessor, ресемплинг в 16 кГц, чанки 1600 сэмплов), `FileRecorder` (MediaRecorder), `AudioQueue` (последовательная озвучка), `sniffAudioType`, `blobFromBase64`. |
| `hooks/useAssistant.ts` | Сообщения, стадии, черновики, токены, запись, озвучка, watchdog 45 с, retry, очистка истории. |
| `components/` | Чистое представление; весь сетевой код через пропсы из `App.tsx`. |

## 3. Текстовый turn

```text
sendText(text)
  → user message + assistant placeholder (pending)
  → POST /v1/chat {session_id, text, locale}, Idempotency-Key: uuid
  → ChatResponse: text, sources[], draft?, action_result?
  → обновление bubble; draft.confirm_token → Map в памяти
  → refreshDrafts(); опционально POST /v1/tts
  → при ошибке: bubble с текстом ошибки + «Повторить» (тот же Idempotency-Key)
```

## 4. Голосовой turn

### WebSocket (режим по умолчанию)

```text
connect WS /v1/ws/voice?session_id=…&token=…
getUserMedia → AudioContext(16 kHz) → AudioWorklet «ochag-pcm16»
  → Int16Array(1600) → socket.send(ArrayBuffer)  (каждые ~100 мс)
stop → {"type":"end"}  (или {"type":"cancel"})
server:
  status(listening/transcribing/thinking/tool) → индикатор
  transcript{final}   → сообщение пользователя
  delta*              → потоковый текст (может быть несколько раундов инструментов)
  action_draft        → карточка черновика + токен в Map
  answer              → финальный текст (заменяет накопленные delta) + sources
  audio{data,index}   → base64 → Blob → AudioQueue
  done / error        → завершение turn, снятие watchdog
```

Соединение **не закрывается** после `done`: бэкенд хранит `confirm_token` внутри WS-сессии для
следующего голосового «да, отправь», а хвостовой `audio`-чанк может прийти уже после `done`
(озвучка последнего незавершённого предложения). Поэтому `AudioQueue` продолжает играть и после
`done`, а `npm run smoke` закрывает тестовый сокет с задержкой. Закрывается при смене
адреса/ключа/сессии или размонтировании.

### REST-файл

```text
MediaRecorder (webm/opus | mp4 | ogg) → stop → Blob
  → POST /v1/voice multipart {file, session_id, locale}
  ← audio blob + URL-encoded X-Transcript / X-Assistant-Text / X-Turn-Id
    / X-Draft-Id / X-Confirm-Token
  → GET /v1/actions/drafts, чтобы дополнить карточку черновика получателем и текстом
  → AudioQueue.enqueue(audio)
```

## 5. Жизнь черновика

```text
POST /v1/chat «напиши маме…»
  → draft(status=pending, confirm_token, expires_at)
  → DraftCard с обратным отсчётом TTL (naive UTC → +"Z")
  ├─ кнопка «Подтвердить» → POST /v1/actions/{id}/confirm {confirm_token}
  │     → status=sent, action_result.message, system-note; повтор → 409
  ├─ кнопка «Отменить»    → POST /v1/actions/{id}/cancel?session_id=…
  └─ фраза «да, отправь» / «отмени» → /v1/chat, детерминированные страховки оркестратора
```

`GET /v1/actions/drafts` не содержит токены: для таких черновиков UI предлагает голосовые/текстовые
фразы. Токены намеренно не сохраняются в `localStorage` — после перезапуска приложения доступен
только сценарий с фразой (бэкенд найдёт последний `pending` по `session_id`).

## 6. Ошибки

`ApiError(status, message)` строится из `detail` FastAPI; `401`, `409`, `429`, `502`, `503`
получают объяснение по-русски. Ошибка сети (статус `0`) отдельно подсказывает проверить адрес.
WS-ошибки приходят событием `{"type":"error"}` и показываются и в баннере, и в bubble.
Watchdog на 45 с снимает `busy`, если сервер не прислал `done`.

## 7. Хранение и PWA

- `ochag.settings.v1` — настройки; `ochag.history.v1` — последние 60 сообщений **без** токенов.
- Service worker кэширует только оболочку (`/`, `index.html`, манифест, иконки); пути `/api/` и
  `/v1/` исключены: диалог, черновики и одноразовые токены не должны попадать в кэш.
- В dev SW не регистрируется, чтобы HMR не отдавал устаревший код.

## 8. Тестирование

`npm run smoke` (`scripts/smoke-test.mjs`) через прокси Vite проверяет:
`/health`, `/ready`, чат + идемпотентность, источники, создание черновика, список без токенов,
`confirm` и повторный `409`, `401` при неверном ключе, `/v1/tts`, `/v1/voice` с заголовками
и полный WS-turn (`transcript → delta → answer → audio → done`).
Все 12 проверок проходят против мок-бэкенда из `scripts/dev-backend.sh`.

## 9. Точки роста

Wake word / VAD на устройстве, OAuth вместо API-ключа, push и фоновая обработка MAX,
офлайн-очередь черновиков, IndexedDB вместо localStorage, метрики latency, E2E-тесты UI.
