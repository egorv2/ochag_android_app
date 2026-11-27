import type { Stage } from './types';

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/** Бэкенд отдаёт naive UTC (datetime без tz) — добавляем Z вручную. */
export function parseServerDate(value?: string | null): Date | null {
  if (!value) return null;
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function expiresLabel(value?: string | null, now = Date.now()): { expired: boolean; text: string } {
  const date = parseServerDate(value);
  if (!date) return { expired: false, text: '' };
  const seconds = Math.round((date.getTime() - now) / 1000);
  if (seconds <= 0) return { expired: true, text: 'срок истёк' };
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return { expired: false, text: `ещё ${minutes}:${String(rest).padStart(2, '0')}` };
}

export function channelLabel(channel: string): string {
  switch (channel) {
    case 'email': return 'Письмо';
    case 'max': return 'MAX';
    case '': return 'Сообщение';
    default: return channel;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'ожидает подтверждения';
    case 'sending': return 'отправляется…';
    case 'sent': return 'отправлено';
    case 'failed': return 'ошибка отправки';
    case 'cancelled': return 'отменено';
    case 'expired': return 'срок истёк';
    default: return status;
  }
}

export const STAGE_LABEL: Record<Stage, string> = {
  idle: 'Готов',
  connecting: 'Подключение',
  listening: 'Слушаю',
  transcribing: 'Распознаю',
  thinking: 'Думаю',
  speaking: 'Говорю',
  done: 'Готов',
  error: 'Ошибка',
};

export const SUGGESTIONS: string[] = [
  'Сколько варить макароны?',
  'Напиши маме, что я задерживаюсь на ужин',
  'Как убрать нагар с кастрюли?',
  'Найди рецепт гречки с грибами',
];
