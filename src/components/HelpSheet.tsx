import { Sheet } from './Sheet';

export function HelpSheet({ onClose, voiceMode }: { onClose: () => void; voiceMode: 'ws' | 'rest' }) {
  return (
    <Sheet title="Как работает Очаг" subtitle="Клиент контракта docs/API.md бэкенда" onClose={onClose} wide>
      <div className="help">
        <section>
          <h3>Диалог</h3>
          <p>
            Текст уходит в <code>POST /v1/chat</code> с <code>session_id</code>, <code>locale</code> и
            заголовками <code>X-API-Key</code> / <code>Idempotency-Key</code>. Ответ содержит текст,
            источники поиска <code>sources</code> и, возможно, черновик <code>draft</code>.
          </p>
        </section>
        <section>
          <h3>Голос</h3>
          <p>
            Сейчас выбран режим <b>{voiceMode === 'ws' ? 'WebSocket' : 'REST-файл'}</b>.
            В WS микрофон ресемплируется в <b>PCM16 16 кГц mono</b> и уходит binary-кадрами в
            <code> /v1/ws/voice</code>; сервер шлёт <code>transcript</code>, <code>delta</code>,
            <code> answer</code>, <code>action_draft</code>, <code>audio</code> (base64) и <code>done</code>.
            В REST-режим записывается файл и отправляется в <code>/v1/voice</code>, а текст ответа
            приходит в URL-encoded заголовках. Отдельно доступны <code>/v1/stt</code> и <code>/v1/tts</code>.
          </p>
          <p className="help__note">
            Микрофону нужен HTTPS (или localhost) и разрешение браузера. Если превью открыто во фрейме
            и доступ запрещён — пишите текстом или переключитесь на REST-режим в настройках.
          </p>
        </section>
        <section>
          <h3>Отправка только с подтверждением</h3>
          <p>
            Помощник никогда не отправляет сразу: сначала создаётся черновик, затем вы явно
            подтверждаете кнопкой (<code>POST /v1/actions/{'{id}'}/confirm</code> с одноразовым
            <code> confirm_token</code>) или говорите «да, отправь». Отмена — <code>.../cancel</code>.
            Получатели берутся только из allowlist контактов бэкенда.
          </p>
        </section>
        <section>
          <h3>Попробуйте в мок-режиме</h3>
          <ul>
            <li>«Сколько варить макароны?» → поиск и источники [1], [2]</li>
            <li>«Напиши маме, что я задерживаюсь на ужин» → черновик письма</li>
            <li>«Да, отправь» → подтверждение и статус «отправлено»</li>
            <li>«Отмени» → отмена ожидающего черновика</li>
            <li>Повторное подтверждение → 409 от бэкенда</li>
          </ul>
        </section>
        <section>
          <h3>Установка</h3>
          <p>
            Это PWA: в меню браузера «Добавить на главный экран». Для APK — <code>npm run cap:add</code>,
            затем <code>npm run cap:open</code> (нужны Android SDK и JDK). Подробности в README.md.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
