import { useEffect, useRef } from 'react';
import { SUGGESTIONS } from '../lib/format';
import type { ChatMessage, DraftItem } from '../lib/types';
import { FlameIcon } from './Icons';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  tokenForDraft: (id: string) => string | null;
  onSuggestion: (text: string) => void;
  onRetry: (id: string) => void;
  onSpeak: (text: string) => void;
  onConfirm: (draft: DraftItem) => void;
  onCancel: (draft: DraftItem) => void;
  onQuickPhrase: (text: string) => void;
  stage: string;
}

export function ChatView(props: Props) {
  const { messages, stage } = props;
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, stage]);

  return (
    <main className="chat" aria-label="Диалог с помощником">
      {messages.length === 0 ? (
        <div className="empty">
          <div className="empty__icon"><FlameIcon size={42} /></div>
          <h1>Добрый вечер!</h1>
          <p>
            Я Очаг — помогу с рецептами и бытовыми вопросами, найду информацию
            и подготовлю письмо или сообщение. Отправка — только после вашего подтверждения.
          </p>
          <div className="empty__chips">
            {SUGGESTIONS.map((text) => (
              <button className="chip chip--suggestion" type="button" key={text} onClick={() => props.onSuggestion(text)}>
                {text}
              </button>
            ))}
          </div>
          <span className="empty__hint">Можно писать текстом или нажать 🎙 и говорить</span>
        </div>
      ) : (
        <div className="chat__list">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              tokenForDraft={props.tokenForDraft}
              onRetry={props.onRetry}
              onSpeak={props.onSpeak}
              onConfirm={props.onConfirm}
              onCancel={props.onCancel}
              onQuickPhrase={props.onQuickPhrase}
            />
          ))}
        </div>
      )}
      <div ref={endRef} />
    </main>
  );
}
