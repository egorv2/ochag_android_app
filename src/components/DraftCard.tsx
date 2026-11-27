import { useEffect, useState } from 'react';
import { channelLabel, expiresLabel, statusLabel } from '../lib/format';
import type { ActionResult, DraftItem } from '../lib/types';
import { CheckIcon, CloseIcon } from './Icons';

interface Props {
  draft: DraftItem;
  result?: ActionResult | null;
  token?: string | null;
  onConfirm?: (draft: DraftItem) => void;
  onCancel?: (draft: DraftItem) => void;
  onQuickPhrase?: (text: string) => void;
  compact?: boolean;
}

function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

export function DraftCard({ draft, result, token, onConfirm, onCancel, onQuickPhrase, compact }: Props) {
  const now = useNow();
  const actionable = (draft.status === 'pending' || draft.status === 'failed') && Boolean(token);
  const pending = draft.status === 'pending' || draft.status === 'failed';
  const expiry = expiresLabel(draft.expires_at, now);

  return (
    <div className={`draft-card ${compact ? 'draft-card--compact' : ''} draft-card--${draft.status}`}>
      <div className="draft-card__top">
        <span className={`channel channel--${draft.channel || 'auto'}`}>{channelLabel(draft.channel)}</span>
        <span className="draft-card__recipient">→ {draft.recipient_display || draft.recipient || 'получатель'}</span>
        <span className={`status status--${draft.status}`}>{statusLabel(draft.status)}</span>
      </div>
      {draft.subject && <div className="draft-card__subject">Тема: {draft.subject}</div>}
      <p className="draft-card__text">«{draft.text}»</p>
      {result?.message && <div className="draft-card__result">{result.message}</div>}
      {pending && expiry.text && (
        <div className={`draft-card__expiry ${expiry.expired ? 'is-expired' : ''}`}>
          {expiry.expired ? 'Срок подтверждения истёк' : `Токен действителен ${expiry.text}`}
        </div>
      )}
      {pending && (
        <div className="draft-card__actions">
          {actionable ? (
            <>
              <button className="btn btn--primary btn--sm" type="button" onClick={() => onConfirm?.(draft)}>
                <CheckIcon size={16} /> Подтвердить отправку
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onCancel?.(draft)}>
                <CloseIcon size={16} /> Отменить
              </button>
            </>
          ) : (
            <div className="draft-card__fallback">
              <span>Токен доступен только в текущей сессии. Подтвердите фразой:</span>
              <div className="chips">
                <button className="chip" type="button" onClick={() => onQuickPhrase?.('да, отправь')}>«Да, отправь»</button>
                <button className="chip" type="button" onClick={() => onQuickPhrase?.('отмени')}>«Отмени»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
