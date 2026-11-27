/**
 * Запись и воспроизведение.
 *
 * WS /v1/ws/voice ждёт binary frames с PCM16 16 kHz mono (20–100 мс чанки).
 * REST /v1/voice принимает любой контейнер (MediaRecorder → webm/opus, mp4, ogg).
 * WS отдаёт {"type":"audio","data":"<base64>"} — это mp3/opus/wav, тип определяем по заголовку.
 */

const WORKLET_SOURCE = `
class OchagPcm16 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.ratio = opts.ratio || 1;
    this.target = opts.target || 1600;
    this.phase = 0;
    this.previous = 0;
    this.buffer = new Int16Array(this.target);
    this.count = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush' && this.count > 0) {
        const out = this.buffer.slice(0, this.count).buffer;
        this.port.postMessage(out, [out]);
        this.count = 0;
      }
    };
  }
  push(value) {
    const v = Math.max(-1, Math.min(1, value));
    this.buffer[this.count++] = v < 0 ? v * 32768 : v * 32767;
    if (this.count === this.target) {
      const out = this.buffer.slice().buffer;
      this.port.postMessage(out, [out]);
      this.count = 0;
    }
  }
  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const current = channel[i];
      this.phase += 1;
      while (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const alpha = 1 - this.phase / this.ratio;
        this.push(this.previous + (current - this.previous) * alpha);
      }
      this.previous = current;
    }
    return true;
  }
}
registerProcessor('ochag-pcm16', OchagPcm16);
`;

const TARGET_RATE = 16_000;
const CHUNK_SAMPLES = 1600; // 100 мс при 16 kHz

export async function getMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Этот браузер не поддерживает запись микрофона. Используйте текстовый ввод.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Доступ к микрофону не разрешён. Дайте разрешение браузеру (или откройте приложение не во фрейме) и попробуйте снова.');
    }
    if (name === 'NotFoundError') throw new Error('Микрофон не найден на устройстве.');
    throw new Error('Не удалось включить микрофон. Можно написать вопрос текстом.');
  }
}

function levelOf(data: ArrayBuffer): number {
  const view = new Int16Array(data);
  let sum = 0;
  const step = Math.max(1, Math.floor(view.length / 256));
  let count = 0;
  for (let i = 0; i < view.length; i += step) {
    sum += (view[i] / 32768) ** 2;
    count += 1;
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, count)) * 4);
}

/** PCM16 16 kHz mono → binary WebSocket frames. */
export class PcmRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private workletUrl: string | null = null;
  private stopped = false;

  private constructor() {}

  static async start(
    onChunk: (data: ArrayBuffer) => void,
    onLevel?: (level: number) => void,
  ): Promise<PcmRecorder> {
    const recorder = new PcmRecorder();
    const stream = await getMicrophoneStream();
    recorder.stream = stream;

    const deliver = (data: ArrayBuffer) => {
      if (recorder.stopped) return;
      onChunk(data);
      if (onLevel) onLevel(levelOf(data));
    };

    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      context = new AudioContext();
    }
    recorder.context = context;
    await context.resume().catch(() => undefined);
    const ratio = context.sampleRate / TARGET_RATE;
    recorder.source = context.createMediaStreamSource(stream);

    if (typeof AudioWorkletNode !== 'undefined' && context.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        recorder.workletUrl = url;
        await context.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(context, 'ochag-pcm16', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { ratio, target: CHUNK_SAMPLES },
        });
        node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => deliver(event.data);
        recorder.node = node;
      } catch {
        // Android WebView / старые браузеры: fallback на ScriptProcessorNode.
        recorder.node = null;
      }
    }

    const mute = context.createGain();
    mute.gain.value = 0;
    recorder.gain = mute;

    if (!recorder.node) {
      const processor = context.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let phase = 0;
        let previous = 0;
        const samples: number[] = [];
        for (let i = 0; i < input.length; i += 1) {
          const current = input[i];
          phase += 1;
          while (phase >= ratio) {
            phase -= ratio;
            const alpha = 1 - phase / ratio;
            const value = Math.max(-1, Math.min(1, previous + (current - previous) * alpha));
            samples.push(value < 0 ? value * 32768 : value * 32767);
          }
          previous = current;
        }
        if (samples.length) deliver(new Int16Array(samples).buffer);
      };
      recorder.node = processor;
    }

    recorder.source.connect(recorder.node);
    recorder.node.connect(mute);
    mute.connect(context.destination);
    return recorder;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.node instanceof AudioWorkletNode) {
      this.node.port.postMessage('flush');
    }
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* уже отключено */
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') {
      await this.context.close().catch(() => undefined);
    }
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
  }
}

/** MediaRecorder → один файл для POST /v1/voice. */
export class FileRecorder {
  private chunks: Blob[] = [];
  private resolveStop: ((blob: Blob) => void) | null = null;
  private cancelled = false;

  private constructor(private recorder: MediaRecorder, stream: MediaStream) {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
      this.resolveStop?.(this.cancelled ? new Blob([], { type: blob.type }) : blob);
      this.resolveStop = null;
    };
  }

  static async start(): Promise<FileRecorder> {
    const stream = await getMicrophoneStream();
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/webm',
    ];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    const instance = new FileRecorder(recorder, stream);
    recorder.start(250);
    return instance;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (this.recorder.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' }));
        return;
      }
      this.resolveStop = resolve;
      this.recorder.stop();
    });
  }

  cancel(): void {
    this.cancelled = true;
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }
}

export function sniffAudioType(bytes: Uint8Array): string {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x52, 0x49, 0x46, 0x46)) return 'audio/wav';
  if (starts(0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';
  if (starts(0x66, 0x4c, 0x61, 0x43)) return 'audio/flac';
  if (starts(0x49, 0x44, 0x33)) return 'audio/mpeg';
  if (starts(0xff, 0xfb) || starts(0xff, 0xf3) || starts(0xff, 0xf2)) return 'audio/mpeg';
  return 'audio/mpeg';
}

export function blobFromBase64(base64: string, type?: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || sniffAudioType(bytes) });
}

/** Последовательное проигрывание потоковых чанков озвучки. */
export class AudioQueue {
  private queue: Blob[] = [];
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  constructor(private onChange?: (playing: boolean) => void) {}

  enqueue(blob: Blob): void {
    if (!blob.size) return;
    this.queue.push(blob);
    void this.playNext();
  }

  private async playNext(): Promise<void> {
    if (this.element || this.queue.length === 0) return;
    const blob = this.queue.shift();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.element = audio;
    this.objectUrl = url;
    this.onChange?.(true);
    const finish = () => {
      if (this.element !== audio) return;
      audio.pause();
      URL.revokeObjectURL(url);
      this.element = null;
      this.objectUrl = null;
      this.onChange?.(false);
      void this.playNext();
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    try {
      await audio.play();
    } catch {
      // Autoplay policy: пользователь должен взаимодействовать со страницей.
      finish();
    }
  }

  stop(): void {
    this.queue = [];
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.onChange?.(false);
  }

  get playing(): boolean {
    return this.element !== null || this.queue.length > 0;
  }
}
