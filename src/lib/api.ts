import { apiUrl, type AppSettings } from './settings';
import type {
  ActionResult,
  ChatResponse,
  DraftItem,
  HealthResponse,
  STTResponse,
  VoiceTurnResult,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_STATUS_TEXT: Record<number, string> = {
  400: 'Некорректный запрос',
  401: 'Неверный или отсутствует API-ключ — проверьте настройки',
  403: 'Доступ запрещён',
  404: 'Черновик не найден',
  409: 'Черновик уже отправлен, отменён, просрочен или неверный токен',
  413: 'Аудиофайл слишком большой',
  422: 'Ошибка валидации запроса',
  429: 'Превышен лимит запросов — подождите немного',
  500: 'Внутренняя ошибка сервера',
  502: 'Все провайдеры LLM/STT/TTS недоступны',
  503: 'Сервис отправки или база данных недоступна',
};

function detailToString(detail: unknown): string | null {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    return first?.msg || null;
  }
  if (detail && typeof detail === 'object' && 'msg' in detail) {
    return String((detail as { msg: unknown }).msg);
  }
  return null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail: unknown = null;
  try {
    const payload = await response.json();
    detail = payload?.detail ?? payload;
  } catch {
    detail = null;
  }
  const serverText = detailToString(detail);
  const message = serverText
    ? `${DEFAULT_STATUS_TEXT[response.status] ?? `Ошибка ${response.status}`}: ${serverText}`
    : (DEFAULT_STATUS_TEXT[response.status] ?? `Ошибка ${response.status} (HTTP ${response.status})`);
  return new ApiError(response.status, message, detail);
}

interface RequestOptions {
  method?: string;
  body?: BodyInit | null;
  json?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request(settings: AppSettings, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'X-API-Key': settings.apiKey,
    ...options.headers,
  };
  let body = options.body ?? null;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(settings, path), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте адрес в настройках и доступность бэкенда.');
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function jsonRequest<T>(settings: AppSettings, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(settings, path, options);
  return (await response.json()) as T;
}

export function getHealth(settings: AppSettings): Promise<HealthResponse> {
  return jsonRequest<HealthResponse>(settings, '/health');
}

export function getReady(settings: AppSettings): Promise<HealthResponse> {
  return jsonRequest<HealthResponse>(settings, '/ready');
}

export interface ChatOptions {
  confirmToken?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function sendChat(settings: AppSettings, text: string, options: ChatOptions = {}): Promise<ChatResponse> {
  const headers: Record<string, string> = {};
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return jsonRequest<ChatResponse>(settings, '/v1/chat', {
    method: 'POST',
    json: {
      session_id: settings.sessionId,
      text,
      locale: settings.locale,
      confirm_token: options.confirmToken ?? null,
    },
    headers,
    signal: options.signal,
  });
}

export function listDrafts(settings: AppSettings): Promise<DraftItem[]> {
  const query = new URLSearchParams({ session_id: settings.sessionId });
  return jsonRequest<DraftItem[]>(settings, `/v1/actions/drafts?${query.toString()}`);
}

export function confirmDraft(settings: AppSettings, draftId: string, token: string): Promise<ActionResult> {
  return jsonRequest<ActionResult>(settings, `/v1/actions/${encodeURIComponent(draftId)}/confirm`, {
    method: 'POST',
    json: { confirm_token: token },
  });
}

export function cancelDraft(settings: AppSettings, draftId: string): Promise<ActionResult> {
  const query = new URLSearchParams({ session_id: settings.sessionId });
  return jsonRequest<ActionResult>(settings, `/v1/actions/${encodeURIComponent(draftId)}/cancel?${query.toString()}`, {
    method: 'POST',
  });
}

export function transcribe(settings: AppSettings, blob: Blob, language?: string): Promise<STTResponse> {
  const form = new FormData();
  form.append('file', blob, audioFilename(blob));
  if (language) form.append('language', language);
  return jsonRequest<STTResponse>(settings, '/v1/stt', { method: 'POST', body: form });
}

export function synthesize(settings: AppSettings, text: string): Promise<Blob> {
  return request(settings, '/v1/tts', {
    method: 'POST',
    json: {
      text,
      format: 'mp3',
      ...(settings.ttsVoice ? { voice: settings.ttsVoice } : {}),
    },
  }).then((response) => response.blob());
}

/** /v1/voice: аудио в теле, текст и черновик — в URL-encoded заголовках. */
export async function voiceTurn(settings: AppSettings, blob: Blob): Promise<VoiceTurnResult> {
  const form = new FormData();
  form.append('file', blob, audioFilename(blob));
  form.append('session_id', settings.sessionId);
  form.append('locale', settings.locale);
  const response = await request(settings, '/v1/voice', { method: 'POST', body: form });
  const header = (name: string): string => {
    const raw = response.headers.get(name);
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };
  return {
    audio: await response.blob(),
    transcript: header('X-Transcript'),
    assistantText: header('X-Assistant-Text'),
    turnId: header('X-Turn-Id'),
    draftId: header('X-Draft-Id') || undefined,
    confirmToken: header('X-Confirm-Token') || undefined,
  };
}

export function audioFilename(blob: Blob): string {
  const type = blob.type || '';
  if (type.includes('mp4') || type.includes('aac')) return 'audio.m4a';
  if (type.includes('ogg')) return 'audio.ogg';
  if (type.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}

export interface ConnectionReport {
  ok: boolean;
  health?: HealthResponse;
  ready?: boolean;
  drafts?: number;
  message: string;
}

export async function checkConnection(settings: AppSettings): Promise<ConnectionReport> {
  try {
    const health = await getHealth(settings);
    let ready = false;
    try {
      await getReady(settings);
      ready = true;
    } catch {
      ready = false;
    }
    const drafts = await listDrafts(settings);
    return {
      ok: true,
      health,
      ready,
      drafts: drafts.length,
      message: `Соединение установлено · env=${health.env ?? '?'} · БД ${ready ? 'готова' : 'недоступна'} · черновиков: ${drafts.length}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Не удалось проверить соединение',
    };
  }
}
