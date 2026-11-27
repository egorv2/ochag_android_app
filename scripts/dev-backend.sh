#!/usr/bin/env bash
# Локальный бэкенд «Очага» в мок-режиме (без ключей, GPU и Docker).
# Репозиторий бэкенда: https://github.com/egorv2/ochag
set -euo pipefail

DIR="${OCHAG_BACKEND_DIR:-/tmp/ochag}"
PORT="${PORT:-8000}"
REPO="${OCHAG_BACKEND_REPO:-https://github.com/egorv2/ochag.git}"

if [ ! -d "$DIR/.git" ]; then
  echo "→ Клонируем бэкенд в $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi

if [ ! -x "$DIR/.venv/bin/python" ]; then
  echo "→ Создаём venv и ставим зависимости"
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -q --disable-pip-version-check -r "$DIR/requirements.txt"
fi

mkdir -p "$DIR/data"
cd "$DIR"

export APP_ENV=dev
export API_KEYS="${API_KEYS:-dev-key}"
export DATABASE_URL="sqlite+aiosqlite:///$DIR/data/assistant.db"
export CORS_ORIGINS='*'
export LLM_PROVIDERS='[{"name":"mock","type":"mock","model":"mock-llm"}]'
export LLM_MOCK_MODE=smart
export STT_TYPE=mock
export TTS_TYPE=mock
export STT_MOCK_TEXT='Сколько по времени варить макароны?'
export SEARCH_PROVIDER=mock
export MAX_TRANSPORT=mock
export EMAIL_TRANSPORT=mock
export CONTACTS_JSON='{"мама":{"channel":"email","recipient":"mama@example.com","name":"Мама"},"ребенок":{"channel":"max","recipient":"1000000000","name":"Ребёнок"}}'
export REQUIRE_CONTACT_ALLOWLIST=true
export CONFIRMATION_TTL_SECONDS=600
export RATE_LIMIT_PER_MINUTE=1000

echo "→ Очаг API: http://0.0.0.0:$PORT  (X-API-Key: $API_KEYS)"
exec "$DIR/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --no-access-log
