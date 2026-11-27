# Очаг · мобильное приложение

Мобильный клиент для голосового помощника «Очаг» (бэкенд — отдельный репозиторий [egorv2/ochag](https://github.com/egorv2/ochag)).
**React + TypeScript + Vite**, PWA (устанавливается на главный экран) и **Capacitor**-обёртка для Android.
Реализован полный контракт `docs/API.md` бэкенда: текстовый чат, живой голос по WebSocket, REST-голос,
STT/TTS, источники поиска и двухфазная отправка с обязательным подтверждением.

---

## Готовый APK

`apk/Ochag-debug.apk` — debug-сборка (3,7 МБ), собранная в GitHub Actions и лежащая в этой ветке.
[Скачать APK](https://github.com/egorv2/ochag_android_app/blob/arena/0387104b-ochag-android-app/apk/Ochag-debug.apk?raw=true)
или взять артефакт `Ochag-debug-apk` в [Actions](https://github.com/egorv2/ochag_android_app/actions).

- пакет `ru.ochag.assistant`, `versionName 1.0`, `minSdk 22`, `targetSdk 34`, compileSdk 34;
- подписан debug-ключом (v1 `CERT.RSA` + APK Signature Scheme v2/v3);
- внутри `classes*.dex` Capacitor, `assets/public/` — собранное веб-приложение;
- разрешения `INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `usesCleartextTraffic` для dev.

Установка: `adb install -r apk/Ochag-debug.apk`. После запуска в «Подключении» укажите полный адрес
бэкенда (для эмулятора `http://10.0.2.2:8000`, для устройства — LAN IP) и API-ключ.
Пересборка: `gh workflow run build-apk.yml` (или любой push в ветку) — workflow сам обновит APK в `apk/`.
Подробности и release-подпись → [docs/ANDROID.md](docs/ANDROID.md).

---

## Что было изучено в бэкенде

Бэкенд — FastAPI + SQLite, все модели подключаются по OpenAI-совместимому протоколу, в базовом режиме
работают детерминированные mock-провайдеры (без ключей и GPU). Ключевые детали контракта:

| Что | Деталь |
| --- | --- |
| Аутентификация | `X-API-Key` для REST; `?token=` для WebSocket. `session_id` хранится на клиенте. |
| `POST /v1/chat` | `{session_id, text, locale, confirm_token?}` → `{turn_id, text, sources[], draft?, action_result?, provider, usage}`; опциональный `Idempotency-Key`. |
| `POST /v1/stt` | multipart `file` (+ `language`) → `{text, language, duration_ms}`. |
| `POST /v1/tts` | `{text, format, voice?}` → бинарное аудио. |
| `POST /v1/voice` | multipart `file, session_id, locale` → аудио + URL-encoded заголовки `X-Transcript`, `X-Assistant-Text`, `X-Turn-Id`, `X-Draft-Id`, `X-Confirm-Token`. |
| `WS /v1/ws/voice` | binary PCM16 16 kHz mono → `end` / `cancel`; события `status`, `transcript`, `delta`, `answer`, `action_draft`, `audio` (base64), `done`, `error`. |
| Черновики | `GET /v1/actions/drafts`, `POST /v1/actions/{id}/confirm` (одноразовый `confirm_token`, TTL 10 мин), `POST /v1/actions/{id}/cancel`. Повтор → `409`. |
| Проверки | `GET /health`, `GET /ready`. Коды `401/404/409/422/429/502/503`. |
| Безопасность | получатели только из `CONTACTS_JSON`; модель не может отправить ничего сама; `draft → явное confirm → send`, аудит в БД. |

Важные нюансы, учтённые в клиенте:

- `expires_at` приходит **naive UTC** (без `Z`) — парсим как UTC, иначе таймер врёт на часовой пояс.
- В WS дельты приходят **по раундам инструментов**; финальное событие `answer` авторитетнее конкатенации `delta`, поэтому текст заменяется, а не склеивается.
- `confirm_token` **не возвращается** в `GET /v1/actions/drafts` — храним его только в памяти текущей сессии.
- WS-соединение надо **держать открытым** между репликами: бэкенд хранит токен последнего черновика внутри WS-сессии, и голосовое «да, отправь» работает только на том же соединении.
- В mock-STT всегда возвращается фиксированная фраза «Сколько по времени варить макароны?» — голосовое подтверждение в мок-режиме не продемонстрировать, зато текстовое «да, отправь» и кнопка работают.

---

## Быстрый старт

```bash
npm install

# Терминал 1: локальный бэкенд в мок-режиме (клонирует egorv2/ochag в /tmp/ochag,
# создаёт venv, поднимает uvicorn на 0.0.0.0:8000, X-API-Key: dev-key)
bash scripts/dev-backend.sh

# Терминал 2: веб-приложение (Vite на 0.0.0.0:5173, прокси /api → :8000)
npm run dev

# Терминал 3: проверка всего контракта через прокси, включая WS
npm run smoke
```

Откройте `http://localhost:5173` (в Arena — живое превью на `https://5173-<sandbox>.e2b.app`).
По умолчанию настройки уже указывают на мок-бэкенд: `baseUrl = /api`, `apiKey = dev-key`.

> Vite проксирует `/api/v1/*` → `http://127.0.0.1:8000/v1/*` (включая WebSocket upgrade).
> Браузер всегда ходит на свой origin — нет ни CORS, ни mixed content. Адрес бэкенда для прокси
> можно переопределить: `OCHAG_BACKEND_URL=http://host:8000 npm run dev`.

### Что попробовать

| Фраза | Результат |
| --- | --- |
| «Сколько варить макароны?» | `web_search` → ответ с карточками источников [1], [2] |
| «Напиши маме, что я задерживаюсь на ужин» | черновик письма с кнопками «Подтвердить» / «Отменить» |
| «Да, отправь» (или кнопка) | `confirm` → статус «отправлено», повтор даст `409` |
| «Отмени» | отмена ожидающего черновика |
| Кнопка 🎙 | запись голоса: WS-стриминг PCM16 16 кГц или REST-файл `/v1/voice` |

---

## Возможности

- **Текстовый чат**: `/v1/chat`, `Idempotency-Key` на каждый turn, retry с тем же ключом, ошибки с человеческими подписями (401/409/429/502/503…).
- **Источники**: нумерованные карточки `[1]`, `[2]` со сниппетами и внешними ссылками.
- **Черновики**: канал (email / MAX), получатель, тема, текст, статус, обратный отсчёт TTL; подтверждение/отмена кнопками; если токен утерян после перезагрузки — фразы «да, отправь» / «отмени»; отдельный экран со списком `/v1/actions/drafts`.
- **Голос, два режима** (переключается в настройках):
  - `WebSocket` — `AudioWorklet` ресемплирует микрофон в PCM16 16 kHz mono, чанки по 100 мс уходят binary-кадрами; на входе `transcript` → `delta` → `answer` → `audio` (base64) → `done`; потоковая озвучка играет последовательно; `cancel` отменяет turn.
  - `REST файл` — `MediaRecorder` → multipart `/v1/voice`; текст берётся из URL-encoded заголовков, аудио — из тела.
- **TTS**: автоматическая озвучка голосовых ответов и кнопка «Озвучить» у любого текстового ответа (`/v1/tts`).
- **Настройки**: адрес бэкенда, API-ключ, `session_id`, локаль, режим голоса, голос TTS, флаги озвучки, проверка соединения (`/health` + `/ready` + drafts), очистка истории.
- **PWA**: манифест, иконки, service worker кэширует только оболочку (API-запросы **никогда** не кэшируются).
- **Android**: сгенерированный Capacitor-проект `android/`, разрешения `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`, свои иконки и тема.

---

## Структура

```text
src/
  App.tsx                  композиция экранов, ошибки, листы настроек
  hooks/useAssistant.ts    состояние диалога: REST/WS turns, черновики, подтверждения, аудио
  lib/types.ts             DTO контракта (ChatResponse, DraftItem, WS-события…)
  lib/settings.ts          настройки, session_id, URL REST/WS, история (localStorage)
  lib/api.ts               REST-клиент: X-API-Key, Idempotency-Key, маппинг ошибок
  lib/ws.ts                WS /v1/ws/voice: binary frames, end/cancel, reconnect
  lib/audio.ts             PCM16-рекордер (AudioWorklet + fallback), MediaRecorder, AudioQueue
  lib/format.ts            naive UTC, TTL, подписи статусов
  components/              Header, StatusBar, ChatView, MessageBubble, DraftCard,
                           SourceList, Composer, SettingsSheet, DraftsSheet, HelpSheet, Icons
  styles.css               мобильный тёмный UI, safe-area, 100dvh
public/                    manifest, sw.js, иконки
scripts/
  dev-backend.sh           подъём бэкенда egorv2/ochag в мок-режиме
  make-icons.py            генерация PNG-иконок (PWA + Android mipmap) без зависимостей
  smoke-test.mjs           12 проверок контракта через /api, включая WS
android/                    Capacitor-проект (Java/Gradle)
docs/ARCHITECTURE.md       потоки данных и состояния
docs/ANDROID.md            сборка APK и настройка устройства
```

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ANDROID.md](docs/ANDROID.md),
контракт бэкенда — [docs/API.md в репозитории ochag](https://github.com/egorv2/ochag/blob/main/docs/API.md).

---

## Скрипты

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Vite dev-сервер `0.0.0.0:5173` с прокси `/api` (в т.ч. WS) |
| `npm run build` | `tsc --noEmit` + production-сборка в `dist/` |
| `npm run preview` | предпросмотр `dist/` с тем же прокси |
| `npm run typecheck` | проверка TypeScript |
| `npm run smoke` | контрактный смоук-тест (нужны запущенные бэкенд и dev-сервер) |
| `npm run cap:add` | `cap add android` (уже выполнено, повторять не нужно) |
| `npm run cap:sync` | пересборка web + копирование в `android/` |
| `npm run cap:open` | открыть Android-проект в Android Studio |

---

## Подключение к своему бэкенду

В листе «Подключение» укажите полный адрес, например `http://192.168.1.10:8000`, и ключ из `API_KEYS`.
`/api` — это **только** dev-прокси Vite; на реальном устройстве он не работает.

- REST: `${baseUrl}/v1/...`; WebSocket: `ws(s)://<тот же хост>/v1/ws/voice?session_id=…&token=…`.
- Страница на HTTPS не сможет обратиться к `http://` бэкенду (mixed content) — для прода нужен HTTPS.
- `session_id` определяет историю и черновики; кнопка «Новый ID» начинает чистую сессию.

---

## Безопасность и ограничения

- `X-API-Key` и WS `?token=` хранятся в `localStorage`; это ключ приложения, а не пользовательская аутентификация (в бэкенде пока нет OAuth/JWT). В проде — HTTPS и реальная авторизация.
- Одноразовые `confirm_token` **не пишутся** в историю и не отображаются; после перезагрузки приложения остаётся только подтверждение фразой (бэкенд найдёт последний pending-черновик сессии).
- История диалога хранится локально (последние 60 сообщений); на бэкенде история живёт в SQLite отдельно.
- Нет wake word и VAD (по дизайну бэкенда это ответственность клиента) — запись запускается кнопкой.
- Нет push-уведомлений, фоновой записи и офлайн-очереди отправок; PWA офлайн показывает только оболочку.
- В мок-режиме STT/TTS/LLM детерминированные: распознаётся одна фраза, озвучка — короткий тон WAV.

---

## Следующие шаги

Wake word + VAD на устройстве, реальный MAX-мост/бот, OAuth/JWT вместо API-ключа, push о входящих
сообщениях MAX, офлайн-очередь черновиков, Room/SQLite вместо localStorage, E2E-тесты WebView,
метрики latency STT/LLM/TTS в UI.
