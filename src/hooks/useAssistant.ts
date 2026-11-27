import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelDraft as apiCancelDraft,
  checkConnection,
  confirmDraft as apiConfirmDraft,
  listDrafts,
  sendChat,
  synthesize,
  voiceTurn,
} from '../lib/api';
import {
  AudioQueue,
  FileRecorder,
  blobFromBase64,
  PcmRecorder,
} from '../lib/audio';
import { clearHistory as clearStoredHistory, loadHistory, saveHistory, type AppSettings, type VoiceMode } from '../lib/settings';
import type {
  ActionResult,
  ChatMessage,
  DraftItem,
  SocketState,
  Stage,
  VoiceServerEvent,
} from '../lib/types';
import { uid } from '../lib/types';
import { VoiceSocket } from '../lib/ws';

const TURN_TIMEOUT_MS = 45_000;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
}

function stageFromEvent(stage: string, tool?: string): { stage: Stage; hint: string } {
  switch (stage) {
    case 'listening': return { stage: 'listening', hint: 'Слушаю…' };
    case 'transcribing': return { stage: 'transcribing', hint: 'Распознаю речь…' };
    case 'thinking': return { stage: 'thinking', hint: 'Думаю…' };
    case 'speaking': return { stage: 'speaking', hint: 'Отвечаю…' };
    case 'tool': return { stage: 'thinking', hint: `Инструмент: ${tool ?? '…'}` };
    case 'cancelled': return { stage: 'idle', hint: 'Отменено' };
    default: return { stage: 'idle', hint: stage || 'Готов' };
  }
}

export interface AssistantApi {
  messages: ChatMessage[];
  drafts: DraftItem[];
  pendingDraft: DraftItem | null;
  stage: Stage;
  stageHint: string;
  busy: boolean;
  recording: boolean;
  recordingMode: VoiceMode | null;
  socketState: SocketState;
  audioPlaying: boolean;
  level: number;
  error: string | null;
  clearError: () => void;
  sendText: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  confirm: (draft: DraftItem) => Promise<void>;
  cancel: (draft: DraftItem) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  startVoice: () => Promise<void>;
  stopVoice: () => Promise<void>;
  cancelVoice: () => void;
  speak: (text: string) => Promise<void>;
  connectSocket: () => Promise<void>;
  checkBackend: () => Promise<string>;
  clearHistory: () => void;
  tokenForDraft: (id: string) => string | null;
}

export function useAssistant(settings: AppSettings): AssistantApi {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [stageHint, setStageHint] = useState('Готов к разговору');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<VoiceMode | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('offline');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const socketRef = useRef<VoiceSocket | null>(null);
  const pcmRef = useRef<PcmRecorder | null>(null);
  const fileRecorderRef = useRef<FileRecorder | null>(null);
  const streamingRef = useRef<string | null>(null);
  const recordingRef = useRef(false);
  const busyRef = useRef(false);
  const tokensRef = useRef<Map<string, string>>(new Map());
  const watchdogRef = useRef<number | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);

  if (!audioQueueRef.current) {
    audioQueueRef.current = new AudioQueue((playing) => setAudioPlaying(playing));
  }

  useEffect(() => saveHistory(messages), [messages]);

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      setError('Сервер не прислал завершение turn за 45 секунд. Попробуйте ещё раз.');
      setStage('error');
      setStageHint('Нет ответа');
      streamingRef.current = null;
      setBusyState(false);
    }, TURN_TIMEOUT_MS);
  }, [clearWatchdog, setBusyState]);

  useEffect(() => () => {
    clearWatchdog();
    socketRef.current?.close();
    void pcmRef.current?.stop();
    fileRecorderRef.current?.cancel();
    audioQueueRef.current?.stop();
  }, [clearWatchdog]);

  const pushMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessage = useCallback((id: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  }, []);

  const markDraft = useCallback((draftId: string, status: string, result?: ActionResult) => {
    setMessages((prev) => prev.map((message) => {
      if (!message.draft || message.draft.id !== draftId) return message;
      return {
        ...message,
        draft: { ...message.draft, status },
        actionResult: result ?? message.actionResult,
      };
    }));
  }, []);

  const refreshDrafts = useCallback(async () => {
    try {
      const list = await listDrafts(settingsRef.current);
      setDrafts(list);
      setMessages((prev) => prev.map((message) => {
        if (!message.draft) return message;
        const fresh = list.find((draft) => draft.id === message.draft?.id);
        if (!fresh) return message;
        return {
          ...message,
          draft: {
            ...fresh,
            confirm_token: message.draft.confirm_token || tokensRef.current.get(fresh.id) || null,
          },
        };
      }));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const blob = await synthesize(settingsRef.current, text.trim());
      audioQueueRef.current?.enqueue(blob);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  const ensureStreamingMessage = useCallback((): string => {
    if (streamingRef.current) return streamingRef.current;
    const id = uid('a');
    streamingRef.current = id;
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', text: '', createdAt: Date.now(), streaming: true, voice: true },
    ]);
    return id;
  }, []);

  const handleWsEvent = useCallback((event: VoiceServerEvent) => {
    switch (event.type) {
      case 'status': {
        const mapped = stageFromEvent(event.stage, event.tool);
        setStage(mapped.stage);
        setStageHint(mapped.hint);
        break;
      }
      case 'transcript': {
        if (event.text && event.final !== false) {
          pushMessage({
            id: uid('u'), role: 'user', text: event.text, createdAt: Date.now(), voice: true,
          });
        }
        break;
      }
      case 'delta': {
        const id = ensureStreamingMessage();
        updateMessage(id, (message) => ({ ...message, text: message.text + event.text, streaming: true }));
        break;
      }
      case 'answer': {
        const id = ensureStreamingMessage();
        // orchestrator шлёт дельты каждого раунда; финальный ответ авторитетнее.
        updateMessage(id, (message) => ({
          ...message,
          text: event.text || message.text,
          sources: event.sources ?? message.sources,
          streaming: false,
        }));
        break;
      }
      case 'action_draft': {
        const id = ensureStreamingMessage();
        const draft = event.draft;
        if (draft.confirm_token) tokensRef.current.set(draft.id, draft.confirm_token);
        updateMessage(id, (message) => ({ ...message, draft, sources: message.sources ?? [] }));
        setStageHint('Черновик ждёт подтверждения');
        void refreshDrafts();
        break;
      }
      case 'audio': {
        if (settingsRef.current.autoPlayVoice) {
          try {
            audioQueueRef.current?.enqueue(blobFromBase64(event.data));
            setStage('speaking');
            setStageHint('Озвучиваю ответ…');
          } catch {
            setError('Не удалось декодировать потоковое аудио');
          }
        }
        break;
      }
      case 'done': {
        clearWatchdog();
        if (streamingRef.current) {
          const id = streamingRef.current;
          updateMessage(id, (message) => ({ ...message, streaming: false, turnId: event.turn_id }));
          streamingRef.current = null;
        }
        setStage('done');
        setStageHint('Готов к разговору');
        setBusyState(false);
        void refreshDrafts();
        break;
      }
      case 'error': {
        clearWatchdog();
        if (streamingRef.current) {
          updateMessage(streamingRef.current, (message) => ({ ...message, streaming: false, error: event.message }));
          streamingRef.current = null;
        }
        setError(event.message);
        setStage('error');
        setStageHint('Ошибка');
        setBusyState(false);
        break;
      }
    }
  }, [clearWatchdog, ensureStreamingMessage, pushMessage, refreshDrafts, setBusyState, updateMessage]);

  const connectSocket = useCallback(async (silent = false): Promise<void> => {
    if (socketRef.current?.isOpen) {
      setSocketState('online');
      return;
    }
    socketRef.current?.close();
    setSocketState('connecting');
    const socket = new VoiceSocket(settingsRef.current, {
      onEvent: handleWsEvent,
      onOpen: () => setSocketState('online'),
      onClose: () => setSocketState('offline'),
      onError: (message) => { if (!silent) setError(message); },
    });
    socketRef.current = socket;
    try {
      await socket.connect();
      setSocketState('online');
    } catch (cause) {
      setSocketState('error');
      if (!silent) setError(messageOf(cause));
    }
  }, [handleWsEvent]);

  // При смене адреса/ключа/сессии пересоздаём WS (бэкенд привязывает черновик к session_id).
  useEffect(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setSocketState('offline');
    if (settings.voiceMode === 'ws' && settings.apiKey) void connectSocket(true);
  }, [settings.baseUrl, settings.apiKey, settings.sessionId, settings.voiceMode, connectSocket]);

  const performChat = useCallback(async (text: string, assistantId: string, idempotencyKey: string) => {
    setBusyState(true);
    setStage('thinking');
    setStageHint('Думаю…');
    try {
      const response = await sendChat(settingsRef.current, text, { idempotencyKey });
      if (response.draft?.confirm_token) tokensRef.current.set(response.draft.id, response.draft.confirm_token);
      updateMessage(assistantId, () => ({
        id: assistantId,
        role: 'assistant',
        text: response.text,
        createdAt: Date.now(),
        sources: response.sources ?? [],
        draft: response.draft ?? undefined,
        actionResult: response.action_result ?? undefined,
        turnId: response.turn_id,
        provider: response.provider,
        sourceText: text,
        idempotencyKey,
      }));
      if (response.action_result) {
        pushMessage({
          id: uid('s'), role: 'system', createdAt: Date.now(),
          text: response.action_result.message || `Отправка: ${response.action_result.status}`,
        });
      }
      setStage('done');
      setStageHint(response.provider ? `Ответ от ${response.provider}` : 'Готов к разговору');
      if (settingsRef.current.speakTextReplies) void speak(response.text);
      void refreshDrafts();
    } catch (cause) {
      const textError = messageOf(cause);
      updateMessage(assistantId, (message) => ({
        ...message, pending: false, streaming: false, error: textError, sourceText: text, idempotencyKey,
      }));
      setError(textError);
      setStage('error');
      setStageHint('Ошибка запроса');
    } finally {
      setBusyState(false);
    }
  }, [pushMessage, refreshDrafts, setBusyState, speak, updateMessage]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || busyRef.current || recordingRef.current) return;
    const key = uid('idem');
    const userId = uid('u');
    const assistantId = uid('a');
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text, createdAt: Date.now(), idempotencyKey: key, sourceText: text },
      { id: assistantId, role: 'assistant', text: '', createdAt: Date.now(), pending: true, sourceText: text, idempotencyKey: key },
    ]);
    await performChat(text, assistantId, key);
  }, [performChat]);

  const retry = useCallback(async (messageId: string) => {
    if (busyRef.current) return;
    const target = messages.find((message) => message.id === messageId);
    if (!target?.sourceText) return;
    updateMessage(messageId, (message) => ({
      ...message, text: '', error: undefined, pending: true, streaming: false,
    }));
    await performChat(target.sourceText, messageId, target.idempotencyKey || uid('idem'));
  }, [messages, performChat, updateMessage]);

  const confirm = useCallback(async (draft: DraftItem) => {
    const token = draft.confirm_token || tokensRef.current.get(draft.id);
    if (!token) {
      setError('Токен подтверждения одноразовый и не сохраняется между запусками. Напишите «да, отправь» — бэкенд подтвердит последний черновик сессии.');
      return;
    }
    markDraft(draft.id, 'sending');
    try {
      const result = await apiConfirmDraft(settingsRef.current, draft.id, token);
      markDraft(draft.id, result.status, result);
      tokensRef.current.delete(draft.id);
      pushMessage({ id: uid('s'), role: 'system', createdAt: Date.now(), text: result.message || 'Отправлено' });
      setStageHint('Сообщение отправлено');
      await refreshDrafts();
    } catch (cause) {
      setError(messageOf(cause));
      await refreshDrafts();
    }
  }, [markDraft, pushMessage, refreshDrafts]);

  const cancel = useCallback(async (draft: DraftItem) => {
    try {
      const result = await apiCancelDraft(settingsRef.current, draft.id);
      markDraft(draft.id, result.status, result);
      tokensRef.current.delete(draft.id);
      pushMessage({ id: uid('s'), role: 'system', createdAt: Date.now(), text: result.message || 'Черновик отменён' });
      await refreshDrafts();
    } catch (cause) {
      setError(messageOf(cause));
      await refreshDrafts();
    }
  }, [markDraft, pushMessage, refreshDrafts]);

  const startVoice = useCallback(async () => {
    if (recordingRef.current || busyRef.current) return;
    const current = settingsRef.current;
    if (!current.apiKey) {
      setError('Укажите API-ключ в настройках подключения.');
      return;
    }
    try {
      if (current.voiceMode === 'rest') {
        const recorder = await FileRecorder.start();
        fileRecorderRef.current = recorder;
        setRecordingMode('rest');
      } else {
        await connectSocket();
        if (!socketRef.current?.isOpen) {
          setError('WebSocket не подключён. Проверьте адрес и ключ либо переключитесь на REST-режим голоса.');
          return;
        }
        const recorder = await PcmRecorder.start(
          (data) => socketRef.current?.sendAudio(data),
          (value) => setLevel(value),
        );
        pcmRef.current = recorder;
        setRecordingMode('ws');
      }
      recordingRef.current = true;
      setRecording(true);
      setStage('listening');
      setStageHint('Говорите… нажмите «Отправить» или «Отмена»');
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
      setRecording(false);
      setRecordingMode(null);
      recordingRef.current = false;
    }
  }, [connectSocket]);

  const stopVoice = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setLevel(0);
    const current = settingsRef.current;

    if (current.voiceMode === 'rest' || recordingMode === 'rest') {
      const recorder = fileRecorderRef.current;
      fileRecorderRef.current = null;
      setRecordingMode(null);
      const blob = recorder ? await recorder.stop() : null;
      if (!blob || blob.size === 0) {
        setStage('idle');
        setStageHint('Запись отменена');
        return;
      }
      setBusyState(true);
      setStage('transcribing');
      setStageHint('Распознаю речь…');
      try {
        const result = await voiceTurn(current, blob);
        let draft: DraftItem | undefined;
        if (result.draftId) {
          const list = await listDrafts(current).catch(() => []);
          const found = list.find((item) => item.id === result.draftId);
          if (result.confirmToken) tokensRef.current.set(result.draftId, result.confirmToken);
          draft = found
            ? { ...found, confirm_token: result.confirmToken || null }
            : {
              id: result.draftId, channel: '', recipient: '', recipient_display: '', text: '',
              status: 'pending', confirm_token: result.confirmToken || null,
            };
          setDrafts(list);
        }
        setMessages((prev) => [
          ...prev,
          { id: uid('u'), role: 'user', text: result.transcript || '(голосовое сообщение)', createdAt: Date.now(), voice: true },
          {
            id: uid('a'), role: 'assistant', text: result.assistantText || 'Готово.', createdAt: Date.now(),
            sources: [], draft, turnId: result.turnId, voice: true,
          },
        ]);
        if (current.autoPlayVoice) audioQueueRef.current?.enqueue(result.audio);
        setStage('done');
        setStageHint(draft ? 'Черновик ждёт подтверждения' : 'Готов к разговору');
      } catch (cause) {
        setError(messageOf(cause));
        setStage('error');
        setStageHint('Ошибка');
      } finally {
        setBusyState(false);
      }
      return;
    }

    // WebSocket-режим: чанки уже улетели, закрываем turn сообщением {"type":"end"}.
    const recorder = pcmRef.current;
    pcmRef.current = null;
    await recorder?.stop();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    setRecordingMode(null);
    setBusyState(true);
    streamingRef.current = null;
    setStage('transcribing');
    setStageHint('Распознаю речь…');
    armWatchdog();
    socketRef.current?.end();
  }, [armWatchdog, recordingMode, setBusyState]);

  const cancelVoice = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    setRecordingMode(null);
    setLevel(0);
    fileRecorderRef.current?.cancel();
    fileRecorderRef.current = null;
    if (pcmRef.current) {
      void pcmRef.current.stop();
      pcmRef.current = null;
      socketRef.current?.cancelTurn();
    }
    audioQueueRef.current?.stop();
    clearWatchdog();
    setBusyState(false);
    setStage('idle');
    setStageHint('Отменено');
  }, [clearWatchdog, setBusyState]);

  const checkBackend = useCallback(async () => {
    const report = await checkConnection(settingsRef.current);
    if (!report.ok) setError(report.message);
    return report.message;
  }, []);

  const clearAll = useCallback(() => {
    clearStoredHistory();
    setMessages([]);
    setDrafts([]);
    tokensRef.current.clear();
    audioQueueRef.current?.stop();
    setStage('idle');
    setStageHint('Готов к разговору');
  }, []);

  const tokenForDraft = useCallback((id: string): string | null => {
    const inMemory = tokensRef.current.get(id);
    if (inMemory) return inMemory;
    const found = messages.find((message) => message.draft?.id === id);
    return found?.draft?.confirm_token ?? null;
  }, [messages]);

  const clearError = useCallback(() => setError(null), []);

  const pendingDraft = useMemo<DraftItem | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const draft = messages[i].draft;
      if (!draft) continue;
      const token = draft.confirm_token || tokensRef.current.get(draft.id);
      if (token && (draft.status === 'pending' || draft.status === 'failed')) {
        return { ...draft, confirm_token: token };
      }
    }
    return null;
  }, [messages]);

  return {
    messages,
    drafts,
    pendingDraft,
    stage,
    stageHint,
    busy,
    recording,
    recordingMode,
    socketState,
    audioPlaying,
    level,
    error,
    clearError,
    sendText,
    retry,
    confirm,
    cancel,
    refreshDrafts,
    startVoice,
    stopVoice,
    cancelVoice,
    speak,
    connectSocket: () => connectSocket(false),
    checkBackend,
    clearHistory: clearAll,
    tokenForDraft,
  };
}
