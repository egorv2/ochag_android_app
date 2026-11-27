import { useState, type KeyboardEvent } from 'react';
import type { VoiceMode } from '../lib/settings';
import type { DraftItem } from '../lib/types';
import { CheckIcon, CloseIcon, MicIcon, SendIcon, StopIcon } from './Icons';

interface Props {
  disabled: boolean;
  busy: boolean;
  recording: boolean;
  recordingMode: VoiceMode | null;
  level: number;
  voiceMode: VoiceMode;
  pendingDraft: DraftItem | null;
  onSend: (text: string) => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onCancelVoice: () => void;
  onConfirm: (draft: DraftItem) => void;
  onCancelDraft: (draft: DraftItem) => void;
}

export function Composer(props: Props) {
  const [text, setText] = useState('');
  const { recording, disabled, busy, pendingDraft } = props;

  const submit = () => {
    const value = text.trim();
    if (!value || disabled || recording) return;
    props.onSend(value);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <footer className="composer">
      {pendingDraft && !recording && (
        <div className="composer__pending">
          <span>Черновик для <b>{pendingDraft.recipient_display || pendingDraft.recipient}</b> ждёт подтверждения</span>
          <div>
            <button className="btn btn--primary btn--sm" type="button" onClick={() => props.onConfirm(pendingDraft)}>
              <CheckIcon size={15} /> Отправить
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => props.onCancelDraft(pendingDraft)}>
              <CloseIcon size={15} /> Отменить
            </button>
          </div>
        </div>
      )}

      {recording ? (
        <div className="composer__recording">
          <div className="recording-info">
            <span className="recording-dot" />
            <div>
              <strong>Идёт запись · {props.recordingMode === 'ws' ? 'WebSocket' : 'файл /v1/voice'}</strong>
              <small>Нажмите «Отправить», когда закончите</small>
            </div>
          </div>
          <div className="level"><span style={{ width: `${Math.round(Math.min(1, props.level) * 100)}%` }} /></div>
          <div className="recording-actions">
            <button className="btn btn--ghost" type="button" onClick={props.onCancelVoice}>Отмена</button>
            <button className="btn btn--primary" type="button" onClick={props.onStopVoice}>
              <StopIcon size={16} /> Отправить речь
            </button>
          </div>
        </div>
      ) : (
        <div className="composer__row">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Спросите про рецепт, быт или попросите написать маме…"
            rows={1}
            disabled={disabled}
            aria-label="Текст сообщения"
          />
          <button
            className={`round-btn round-btn--mic ${props.voiceMode === 'ws' ? 'is-ws' : ''}`}
            type="button"
            onClick={props.onStartVoice}
            disabled={disabled}
            title={props.voiceMode === 'ws' ? 'Голос через WebSocket (PCM16 16 кГц)' : 'Записать файл и отправить в /v1/voice'}
            aria-label="Записать голос"
          >
            <MicIcon />
          </button>
          <button
            className="round-btn round-btn--send"
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Отправить"
          >
            <SendIcon />
          </button>
        </div>
      )}
      {busy && !recording && <div className="composer__busy">Очаг обрабатывает запрос…</div>}
    </footer>
  );
}
