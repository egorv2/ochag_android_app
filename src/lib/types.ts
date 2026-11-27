/** DTO бэкенда Очага (app/schemas.py, docs/API.md). */

export interface SourceItem {
  title: string;
  url: string;
  snippet?: string;
}

export interface DraftItem {
  id: string;
  channel: string;
  recipient: string;
  recipient_display: string;
  subject?: string;
  text: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'expired' | string;
  /** Одноразовый токен приходит только в ответе /v1/chat и в WS action_draft. Не показываем пользователю. */
  confirm_token?: string | null;
  /** Naive UTC (бэкенд пишет datetime без tz) — парсим как UTC. */
  expires_at?: string | null;
}

export interface ActionResult {
  draft_id: string;
  status: string;
  channel?: string;
  recipient?: string;
  external_id?: string;
  message?: string;
}

export interface ChatResponse {
  session_id: string;
  turn_id: string;
  text: string;
  sources?: SourceItem[];
  draft?: DraftItem | null;
  action_result?: ActionResult | null;
  provider?: string;
  usage?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  env?: string;
}

export interface STTResponse {
  text: string;
  language?: string;
  duration_ms?: number;
}

export type WsStage = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'cancelled' | 'tool' | string;

export type VoiceServerEvent =
  | { type: 'status'; stage: WsStage; tool?: string }
  | { type: 'transcript'; text: string; final?: boolean }
  | { type: 'delta'; text: string }
  | { type: 'answer'; text: string; sources?: SourceItem[] }
  | { type: 'action_draft'; draft: DraftItem }
  | { type: 'audio'; data: string; index?: number }
  | { type: 'done'; turn_id: string }
  | { type: 'error'; message: string };

export type Stage = 'idle' | 'connecting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'done' | 'error';
export type SocketState = 'offline' | 'connecting' | 'online' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: number;
  sources?: SourceItem[];
  draft?: DraftItem | null;
  actionResult?: ActionResult | null;
  pending?: boolean;
  streaming?: boolean;
  error?: string;
  turnId?: string;
  provider?: string;
  /** Повтор запроса с тем же ключом вернёт сохранённый ответ (Idempotency-Key). */
  idempotencyKey?: string;
  /** Для retry: исходный текст пользователя. */
  sourceText?: string;
  voice?: boolean;
}

export interface VoiceTurnResult {
  audio: Blob;
  transcript: string;
  assistantText: string;
  turnId: string;
  draftId?: string;
  confirmToken?: string;
}

export function uid(prefix = 'm'): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}
