import type { ChatMessage } from './types';

export type VoiceMode = 'ws' | 'rest';

export interface AppSettings {
  /**
   * '/api' — same-origin dev-прокси Vite (браузер → /api/v1/* → бэкенд).
   * Абсолютный URL ('http://192.168.1.10:8000') — для реального сервера / Capacitor.
   */
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  locale: string;
  voiceMode: VoiceMode;
  /** Проигрывать потоковое аудио из WS. */
  autoPlayVoice: boolean;
  /** Озвучивать текстовые ответы через POST /v1/tts. */
  speakTextReplies: boolean;
  ttsVoice: string;
}

const SETTINGS_KEY = 'ochag.settings.v1';
const HISTORY_KEY = 'ochag.history.v1';

function isNative(): boolean {
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function makeSessionId(): string {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `phone-${raw}`;
}

export function defaultSettings(): AppSettings {
  return {
    baseUrl: isNative() ? 'http://10.0.2.2:8000' : '/api',
    apiKey: isNative() ? '' : 'dev-key',
    sessionId: makeSessionId(),
    locale: 'ru-RU',
    voiceMode: 'ws',
    autoPlayVoice: true,
    speakTextReplies: false,
    ttsVoice: '',
  };
}

export function loadSettings(): AppSettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...base,
      ...saved,
      baseUrl: typeof saved.baseUrl === 'string' && saved.baseUrl.trim() ? saved.baseUrl : base.baseUrl,
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : base.apiKey,
      sessionId: typeof saved.sessionId === 'string' && saved.sessionId.trim() ? saved.sessionId : base.sessionId,
      voiceMode: saved.voiceMode === 'rest' ? 'rest' : 'ws',
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* приватный режим / нет localStorage — работаем в памяти */
  }
}

export function normalizeBase(baseUrl: string): string {
  const value = (baseUrl || '').trim();
  if (!value) return '/api';
  return value.replace(/\/+$/, '');
}

export function apiUrl(settings: AppSettings, path: string): string {
  const base = normalizeBase(settings.baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (base.startsWith('/')) return `${base}${suffix}`;
  return `${base}${suffix}`;
}

export function wsUrl(settings: AppSettings, path = '/v1/ws/voice'): string {
  const base = normalizeBase(settings.baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  let absolute: string;
  if (base.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    absolute = `${protocol}//${window.location.host}${base}${suffix}`;
  } else {
    absolute = base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + suffix;
  }
  const url = new URL(absolute, window.location.href);
  url.searchParams.set('session_id', settings.sessionId);
  url.searchParams.set('token', settings.apiKey);
  return url.toString();
}

/** В историю не кладём одноразовые токены и технические флаги. */
export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-60).map((message) => ({
      ...message,
      pending: false,
      streaming: false,
      draft: message.draft ? { ...message.draft, confirm_token: undefined } : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    const safe = messages.slice(-60).map((message) => ({
      ...message,
      pending: false,
      streaming: false,
      draft: message.draft ? { ...message.draft, confirm_token: undefined } : undefined,
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(safe));
  } catch {
    /* игнорируем */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* игнорируем */
  }
}
