import { formatTime } from '../lib/format';
import type { ActionResult, ChatMessage, DraftItem } from '../lib/types';
import { DraftCard } from './DraftCard';
import { FlameIcon, RefreshIcon, SpeakerIcon } from './Icons';
import { SourceList } from './SourceList';

interface Props {
  message: ChatMessage;
  tokenForDraft: (id: string) => string | null;
  onRetry: (id: string) => void;
  onSpeak: (text: string) => void;
  onConfirm: (draft: DraftItem) => void;
  onCancel: (draft: DraftItem) => void;
  onQuickPhrase: (text: string) => void;
}

export function MessageBubble({ message, tokenForDraft, onRetry, onSpeak, onConfirm, onCancel, onQuickPhrase }: Props) {
  if (message.role === 'system') {
    return (
      <div className="system-note">
        <span>{message.text}</span>
        <time>{formatTime(message.createdAt)}</time>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="row row--user">
        <div className="bubble bubble--user">
          {message.voice && <span className="bubble__tag">🎙 голос</span>}
          <p>{message.text}</p>
          <time>{formatTime(message.createdAt)}</time>
        </div>
      </div>
    );
  }

  const draft = message.draft;
  const result: ActionResult | null | undefined = message.actionResult;
  const token = draft ? draft.confirm_token || tokenForDraft(draft.id) : null;

  return (
    <div className="row row--assistant">
      <div className="avatar"><FlameIcon size={19} /></div>
      <div className="bubble bubble--assistant">
        <div className="bubble__head">
          <strong>Очаг</strong>
          {message.provider && <span className="bubble__provider">{message.provider}</span>}
          <time>{formatTime(message.createdAt)}</time>
        </div>

        {message.pending && (
          <div className="typing" aria-label="Очаг думает"><i /><i /><i /></div>
        )}

        {message.text && (
          <p className={message.streaming ? 'is-streaming' : undefined}>{message.text}</p>
        )}

        {message.error && (
          <div className="bubble__error">
            <span>{message.error}</span>
            {message.sourceText && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onRetry(message.id)}>
                <RefreshIcon size={15} /> Повторить
              </button>
            )}
          </div>
        )}

        <SourceList sources={message.sources} />

        {draft && (
          <DraftCard
            draft={draft}
            result={result}
            token={token}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onQuickPhrase={onQuickPhrase}
          />
        )}

        {result && !draft && <div className="bubble__result">{result.message}</div>}

        {message.text && !message.pending && !message.error && (
          <button className="speak-btn" type="button" onClick={() => onSpeak(message.text)} title="Озвучить ответ">
            <SpeakerIcon size={15} /> Озвучить
          </button>
        )}
      </div>
    </div>
  );
}
