import { useEffect, useState } from 'react';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { DraftsSheet } from './components/DraftsSheet';
import { Header } from './components/Header';
import { HelpSheet } from './components/HelpSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { StatusBar } from './components/StatusBar';
import { useAssistant } from './hooks/useAssistant';
import { checkConnection } from './lib/api';
import { loadSettings, saveSettings, type AppSettings } from './lib/settings';

type SheetKind = 'settings' | 'drafts' | 'help' | null;

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [sheet, setSheet] = useState<SheetKind>(null);
  const assistant = useAssistant(settings);

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    void assistant.refreshDrafts();
  }, [assistant.refreshDrafts, settings.sessionId, settings.apiKey, settings.baseUrl]);

  useEffect(() => {
    if (!assistant.error) return;
    const timer = window.setTimeout(() => assistant.clearError(), 12_000);
    return () => window.clearTimeout(timer);
  }, [assistant.error, assistant.clearError]);

  const quickPhrase = (text: string) => {
    setSheet(null);
    void assistant.sendText(text);
  };

  const pendingCount = assistant.drafts.filter(
    (draft) => draft.status === 'pending' || draft.status === 'failed',
  ).length;

  return (
    <div className="app">
      <div className="app__glow" aria-hidden="true" />
      <div className="app__frame">
        <Header
          socketState={assistant.socketState}
          voiceMode={settings.voiceMode}
          pendingCount={pendingCount}
          sessionId={settings.sessionId}
          onSettings={() => setSheet('settings')}
          onDrafts={() => setSheet('drafts')}
          onHelp={() => setSheet('help')}
        />
        <StatusBar
          stage={assistant.stage}
          hint={assistant.stageHint}
          socketState={assistant.socketState}
          voiceMode={settings.voiceMode}
          audioPlaying={assistant.audioPlaying}
          recording={assistant.recording}
          onReconnect={() => void assistant.connectSocket()}
        />

        {assistant.error && (
          <div className="banner" role="alert">
            <span>{assistant.error}</span>
            <button type="button" onClick={assistant.clearError} aria-label="Скрыть ошибку">✕</button>
          </div>
        )}

        <ChatView
          messages={assistant.messages}
          stage={assistant.stage}
          tokenForDraft={assistant.tokenForDraft}
          onSuggestion={(text) => void assistant.sendText(text)}
          onRetry={(id) => void assistant.retry(id)}
          onSpeak={(text) => void assistant.speak(text)}
          onConfirm={(draft) => void assistant.confirm(draft)}
          onCancel={(draft) => void assistant.cancel(draft)}
          onQuickPhrase={quickPhrase}
        />

        <Composer
          disabled={assistant.busy}
          busy={assistant.busy}
          recording={assistant.recording}
          recordingMode={assistant.recordingMode}
          level={assistant.level}
          voiceMode={settings.voiceMode}
          pendingDraft={assistant.pendingDraft}
          onSend={(text) => void assistant.sendText(text)}
          onStartVoice={() => void assistant.startVoice()}
          onStopVoice={() => void assistant.stopVoice()}
          onCancelVoice={assistant.cancelVoice}
          onConfirm={(draft) => void assistant.confirm(draft)}
          onCancelDraft={(draft) => void assistant.cancel(draft)}
        />
      </div>

      {sheet === 'settings' && (
        <SettingsSheet
          settings={settings}
          onClose={() => setSheet(null)}
          onSave={(next) => { setSettings(next); setSheet(null); }}
          onCheck={async (candidate) => {
            const report = await checkConnection(candidate);
            return { ok: report.ok, message: report.message };
          }}
          onClearHistory={assistant.clearHistory}
        />
      )}
      {sheet === 'drafts' && (
        <DraftsSheet
          drafts={assistant.drafts}
          tokenForDraft={assistant.tokenForDraft}
          onRefresh={assistant.refreshDrafts}
          onClose={() => setSheet(null)}
          onConfirm={(draft) => void assistant.confirm(draft)}
          onCancel={(draft) => void assistant.cancel(draft)}
          onQuickPhrase={quickPhrase}
        />
      )}
      {sheet === 'help' && <HelpSheet onClose={() => setSheet(null)} voiceMode={settings.voiceMode} />}
    </div>
  );
}
