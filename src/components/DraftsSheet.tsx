import { useEffect } from 'react';
import { channelLabel, statusLabel } from '../lib/format';
import type { DraftItem } from '../lib/types';
import { DraftCard } from './DraftCard';
import { RefreshIcon } from './Icons';
import { Sheet } from './Sheet';

interface Props {
  drafts: DraftItem[];
  tokenForDraft: (id: string) => string | null;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onConfirm: (draft: DraftItem) => void;
  onCancel: (draft: DraftItem) => void;
  onQuickPhrase: (text: string) => void;
}

export function DraftsSheet({ drafts, tokenForDraft, onRefresh, onClose, onConfirm, onCancel, onQuickPhrase }: Props) {
  useEffect(() => {
    void onRefresh();
  }, [onRefresh]);

  return (
    <Sheet
      title="Черновики"
      subtitle={`GET /v1/actions/drafts · записей: ${drafts.length}`}
      onClose={onClose}
      wide
    >
      <div className="drafts-toolbar">
        <span>Список не содержит токены подтверждения — они приходят только в ответе /v1/chat и в WS.</span>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => void onRefresh()}>
          <RefreshIcon size={15} /> Обновить
        </button>
      </div>
      {drafts.length === 0 ? (
        <div className="blank">Черновиков пока нет. Попросите: «Напиши маме, что я задерживаюсь».</div>
      ) : (
        <div className="drafts-list">
          {drafts.map((draft) => (
            <div className="drafts-list__item" key={draft.id}>
              <div className="drafts-list__meta">
                <span className={`channel channel--${draft.channel || 'auto'}`}>{channelLabel(draft.channel)}</span>
                <code>{draft.id}</code>
                <span className={`status status--${draft.status}`}>{statusLabel(draft.status)}</span>
              </div>
              <DraftCard
                draft={draft}
                token={tokenForDraft(draft.id)}
                compact
                onConfirm={onConfirm}
                onCancel={onCancel}
                onQuickPhrase={onQuickPhrase}
              />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
