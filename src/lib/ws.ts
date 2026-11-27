import { wsUrl, type AppSettings } from './settings';
import type { VoiceServerEvent } from './types';

export interface WsHandlers {
  onEvent: (event: VoiceServerEvent) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string) => void;
}

/**
 * Обёртка над /v1/ws/voice. Соединение держим открытым между turn'ами:
 * бэкенд хранит confirm_token последнего черновика внутри WS-сессии,
 * поэтому голосовое «да, отправь» работает только на том же соединении.
 */
export class VoiceSocket {
  private socket: WebSocket | null = null;
  private intentionallyClosed = false;

  constructor(private settings: AppSettings, private handlers: WsHandlers) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    this.close();
    this.intentionallyClosed = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(this.settings));
      } catch (error) {
        reject(new Error(`Неверный адрес WebSocket: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      this.socket = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        settled = true;
        this.handlers.onOpen?.();
        resolve();
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        if (typeof event.data !== 'string') return;
        let parsed: VoiceServerEvent;
        try {
          parsed = JSON.parse(event.data) as VoiceServerEvent;
        } catch {
          this.handlers.onError?.('Некорректное событие WebSocket');
          return;
        }
        this.handlers.onEvent(parsed);
      };
      socket.onerror = () => {
        const message = 'Ошибка WebSocket. Проверьте адрес бэкенда и API-ключ.';
        this.handlers.onError?.(message);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };
      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null;
        const reason = event.reason || (event.code === 1008 ? 'Неверный API-ключ (401)' : `соединение закрыто (${event.code})`);
        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }
        if (!this.intentionallyClosed) this.handlers.onClose?.(reason);
      };
    });
  }

  sendAudio(data: ArrayBuffer): void {
    if (!this.isOpen) return;
    this.socket?.send(data);
  }

  /** Конец речи. confirm_token можно передать явно, но обычно бэкенд берёт его из action_draft. */
  end(confirmToken?: string): void {
    if (!this.isOpen) return;
    const payload: Record<string, unknown> = { type: 'end', audio_index: 0 };
    if (confirmToken) payload.confirm_token = confirmToken;
    this.socket?.send(JSON.stringify(payload));
  }

  cancelTurn(): void {
    if (!this.isOpen) return;
    this.socket?.send(JSON.stringify({ type: 'cancel' }));
  }

  close(): void {
    this.intentionallyClosed = true;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  }
}
