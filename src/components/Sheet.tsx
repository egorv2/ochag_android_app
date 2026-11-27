import type { ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Sheet({ title, subtitle, onClose, children, wide }: Props) {
  return (
    <div className="sheet-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`sheet ${wide ? 'sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </section>
    </div>
  );
}
