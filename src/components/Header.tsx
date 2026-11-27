import type { SocketState } from '../lib/types';
import type { VoiceMode } from '../lib/settings';
import { DraftsIcon, FlameIcon, HelpIcon, SettingsIcon } from './Icons';

interface Props {
  socketState: SocketState;
  voiceMode: VoiceMode;
  pendingCount: number;
  sessionId: string;
  onSettings: () => void;
  onDrafts: () => void;
  onHelp: () => void;
}

const WS_LABEL: Record<SocketState, string> = {
  online: 'WS онлайн',
  connecting: 'Подключение…',
  offline: 'WS офлайн',
  error: 'Ошибка WS',
};

export function Header({ socketState, voiceMode, pendingCount, sessionId, onSettings, onDrafts, onHelp }: Props) {
  const label = voiceMode === 'ws' ? WS_LABEL[socketState] : 'REST';
  const state = voiceMode === 'ws' ? socketState : 'online';
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__logo"><FlameIcon size={22} /></div>
        <div>
          <h1>Очаг</h1>
          <span className="header__session" title={sessionId}>сессия {sessionId.slice(-8)}</span>
        </div>
      </div>
      <div className="header__right">
        <span className={`conn conn--${state}`} title={label}>
          <i /> {label}
        </span>
        <button className="icon-btn" type="button" onClick={onDrafts} aria-label="Черновики">
          <DraftsIcon />
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </button>
        <button className="icon-btn" type="button" onClick={onHelp} aria-label="Справка"><HelpIcon /></button>
        <button className="icon-btn" type="button" onClick={onSettings} aria-label="Настройки"><SettingsIcon /></button>
      </div>
    </header>
  );
}
