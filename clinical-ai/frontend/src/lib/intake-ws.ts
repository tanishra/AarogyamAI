import { getWsBaseUrl } from "@/lib/auth";

export type IntakeWsEnvelope = {
  event: string;
  event_id: string;
  ts: string;
  session_id: string;
  payload: Record<string, unknown>;
};

type Handlers = {
  onEvent: (envelope: IntakeWsEnvelope) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
};

export class IntakeWsClient {
  private socket: WebSocket | null = null;
  private readonly sessionId: string;
  private readonly token: string;
  private readonly handlers: Handlers;

  constructor(sessionId: string, token: string, handlers: Handlers) {
    this.sessionId = sessionId;
    this.token = token;
    this.handlers = handlers;
  }

  connect(): void {
    if (this.socket) return;
    const url = `${getWsBaseUrl()}/ws/v1/intake/session/${this.sessionId}?token=${encodeURIComponent(
      this.token
    )}`;
    this.socket = new WebSocket(url, []);
    this.socket.onopen = () => {
      this.handlers.onOpen?.();
    };
    this.socket.onclose = () => {
      this.handlers.onClose?.();
      this.socket = null;
    };
    this.socket.onerror = (e) => {
      this.handlers.onError?.(e);
    };
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as IntakeWsEnvelope;
        this.handlers.onEvent(data);
      } catch {
        // ignore malformed WS payload
      }
    };

  }

  sendTextAnswer(text: string, topicTag?: string): void {
    this.sendRaw({
      event: "text.answer",
      payload: { text, topic_tag: topicTag ?? null },
    });
  }

  sendAudioChunk(payload: {
    seq: number;
    pcm16_b64: string;
    sample_rate: number;
    is_last: boolean;
    topic_tag?: string;
  }): void {
    this.sendRaw({
      event: "audio.chunk",
      payload,
    });
  }

  sendAudioBlob(payload: {
    seq: number;
    audio_b64: string;
    mime_type: string;
    is_last: boolean;
    topic_tag?: string;
  }): void {
    this.sendRaw({
      event: "audio.chunk",
      payload,
    });
  }

  switchMode(targetMode: string, reason: string): void {
    this.sendRaw({
      event: "control.switch_mode",
      payload: { target_mode: targetMode, reason },
    });
  }

  complete(): void {
    this.sendRaw({
      event: "control.complete",
      payload: { confirm: true },
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private sendRaw(message: {
    event: string;
    payload: Record<string, unknown>;
  }): void {
    const send = () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify(message));
    };
    if (this.socket?.readyState === WebSocket.OPEN) {
      send();
    } else {
      setTimeout(send, 120);
    }
  }
}
