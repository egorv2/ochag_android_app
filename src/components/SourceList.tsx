import type { SourceItem } from '../lib/types';
import { LinkIcon } from './Icons';

interface Props {
  sources?: SourceItem[];
}

export function SourceList({ sources }: Props) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <div className="sources__label">Источники</div>
      {sources.map((source, index) => (
        <a
          className="source"
          key={`${source.url}-${index}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="source__index">[{index + 1}]</span>
          <span className="source__text">
            <strong>{source.title || 'Источник'}</strong>
            {source.snippet && <em>{source.snippet}</em>}
          </span>
          <LinkIcon size={15} />
        </a>
      ))}
    </div>
  );
}
