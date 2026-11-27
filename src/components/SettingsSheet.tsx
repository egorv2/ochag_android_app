import { useState, type ReactNode } from 'react';
import { makeSessionId, type AppSettings } from '../lib/settings';
import { RefreshIcon, TrashIcon } from './Icons';
import { Sheet } from './Sheet';

interface Props {
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
  onClose: () => void;
  onCheck: (candidate: AppSettings) => Promise<{ ok: boolean; message: string }>;
  onClearHistory: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <small className="field__hint">{hint}</small>}
    </label>
  );
}

export function SettingsSheet({ settings, onSave, onClose, onCheck, onClearHistory }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<{ ok: boolean; message: string } | null>(null);

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setReport(null);
  };

  const check = async () => {
    setChecking(true);
    try {
      setReport(await onCheck(draft));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet title="Подключение" subtitle="Адрес бэкенда, ключ и параметры голоса" onClose={onClose} wide>
      <div className="settings-grid">
        <Field
          label="Базовый URL бэкенда"
          hint="В веб-превью оставьте /api — Vite проксирует /api/v1/* на FastAPI. На устройстве укажите полный адрес, например http://192.168.1.10:8000"
        >
          <input value={draft.baseUrl} onChange={(event) => patch('baseUrl', event.target.value)} placeholder="/api" inputMode="url" />
        </Field>

        <Field label="API-ключ (X-API-Key)" hint="Для WebSocket ключ передаётся в query ?token=. В проде используйте HTTPS.">
          <div className="input-with-btn">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              onChange={(event) => patch('apiKey', event.target.value)}
              placeholder="dev-key"
              autoComplete="off"
            />
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setShowKey((value) => !value)}>
              {showKey ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </Field>

        <Field label="Session ID" hint="Хранится на клиенте; бэкенд связывает с ним историю и черновики.">
          <div className="input-with-btn">
            <input value={draft.sessionId} onChange={(event) => patch('sessionId', event.target.value)} />
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => patch('sessionId', makeSessionId())}>Новый ID</button>
          </div>
        </Field>

        <Field label="Локаль">
          <select value={draft.locale} onChange={(event) => patch('locale', event.target.value)}>
            <option value="ru-RU">ru-RU</option>
            <option value="en-US">en-US</option>
          </select>
        </Field>

        <Field label="Режим голоса" hint="WebSocket — потоковый PCM16 16 кГц + стриминг ответа и TTS. REST — один файл в /v1/voice.">
          <div className="segmented">
            <button className={draft.voiceMode === 'ws' ? 'is-active' : ''} type="button" onClick={() => patch('voiceMode', 'ws')}>WebSocket</button>
            <button className={draft.voiceMode === 'rest' ? 'is-active' : ''} type="button" onClick={() => patch('voiceMode', 'rest')}>REST файл</button>
          </div>
        </Field>

        <Field label="Голос TTS (необязательно)" hint="Например ru_RU-irina-medium. Пусто — голос бэкенда по умолчанию.">
          <input value={draft.ttsVoice} onChange={(event) => patch('ttsVoice', event.target.value)} placeholder="по умолчанию" />
        </Field>

        <label className="toggle">
          <input type="checkbox" checked={draft.autoPlayVoice} onChange={(event) => patch('autoPlayVoice', event.target.checked)} />
          <span>Озвучивать голосовые ответы (поток audio из WS и /v1/voice)</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.speakTextReplies} onChange={(event) => patch('speakTextReplies', event.target.checked)} />
          <span>Озвучивать текстовые ответы через /v1/tts</span>
        </label>
      </div>

      {report && <div className={`report ${report.ok ? 'report--ok' : 'report--error'}`}>{report.message}</div>}

      <div className="sheet__actions">
        <button className="btn btn--ghost" type="button" onClick={check} disabled={checking}>
          <RefreshIcon size={16} /> {checking ? 'Проверяем…' : 'Проверить соединение'}
        </button>
        <button
          className="btn btn--danger"
          type="button"
          onClick={() => {
            if (window.confirm('Удалить историю диалога с этого устройства?')) onClearHistory();
          }}
        >
          <TrashIcon size={16} /> Очистить историю
        </button>
        <button className="btn btn--primary" type="button" onClick={() => onSave(draft)}>Сохранить</button>
      </div>

      <div className="callout">
        <strong>Безопасность.</strong> Токен подтверждения одноразовый и живёт 10 минут: он не сохраняется в историю
        и не показывается в интерфейсе. Отправка выполняется только после явного подтверждения — кнопкой
        или фразой «да, отправь».
      </div>
    </Sheet>
  );
}
