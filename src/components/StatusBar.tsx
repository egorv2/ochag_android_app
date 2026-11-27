import { STAGE_LABEL } from '../lib/format';
import type { VoiceMode } from '../lib/settings';
import type { SocketState, Stage } from '../lib/types';
import { BoltIcon, RefreshIcon, SpeakerIcon } from './Icons';

interface Props {
  stage: Stage;
  hint: string;
  socketState: SocketState;
  voiceMode: VoiceMode;
  audioPlaying: boolean;
  recording: boolean;
  onReconnect: () => void;
}

export function StatusBar({ stage, hint, socketState, voiceMode, audioPlaying, recording, onReconnect }: Props) {
  const active = recording || stage === 'listening' || stage === 'thinking' || stage === 'transcribing' || stage === 'speaking';
  return (
    <div className="statusbar">
      <span className={`statusbar__dot ${active ? 'is-active' : ''} ${stage === 'error' ? 'is-error' : ''}`} />
      <span className="statusbar__stage">{STAGE_LABEL[stage]}</span>
      <span className="statusbar__hint">{hint}</span>
      {audioPlaying && <span className="statusbar__audio"><SpeakerIcon size={14} /> аудио</span>}
      {voiceMode === 'ws' && (socketState === 'error' || socketState === 'offline') && (
        <button className="statusbar__reconnect" type="button" onClick={onReconnect}>
          <RefreshIcon size={14} /> Переподключить
        </button>
      )}
      {voiceMode === 'ws' && socketState === 'online' && <BoltIcon size={14} className="statusbar__bolt" />}
    </div>
  );
}
