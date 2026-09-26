import {
  BinanceUsdmDepthBookSynchronizer,
  type SynchronizedDepthBook,
} from "./depth-book.ts";

export type BinanceUsdmAdapterStatus =
  | "stopped"
  | "connecting"
  | "buffering"
  | "synchronized"
  | "stale"
  | "reconnecting";

export type BinanceUsdmMarketDataState = {
  symbol: string;
  status: BinanceUsdmAdapterStatus;
  transportConnected: boolean;
  reconnectAttempt: number;
  lastReceivedAtMs?: number;
  lastUpdateId?: number;
  reason?: string;
};

export type BinanceUsdmWebSocket = {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: any) => void): void;
  close(code?: number, reason?: string): void;
};

export type BinanceUsdmFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type BinanceUsdmMarketDataOptions = {
  websocketFactory?: (url: string) => BinanceUsdmWebSocket;
  fetchImpl?: (url: string, init: { signal: AbortSignal }) => Promise<BinanceUsdmFetchResponse>;
  websocketBaseUrl?: string;
  restBaseUrl?: string;
  snapshotLimit?: 5 | 10 | 20 | 50 | 100 | 500 | 1000;
  staleAfterMs?: number;
  snapshotTimeoutMs?: number;
  connectionTimeoutMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  now?: () => number;
  setTimeoutImpl?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutImpl?: (timer: ReturnType<typeof setTimeout>) => void;
  onStateChange?: (state: BinanceUsdmMarketDataState) => void;
  onBook?: (book: SynchronizedDepthBook) => void;
};

type Timer = ReturnType<typeof setTimeout>;

const SOCKET_OPEN = 1;
const DEFAULT_REST_BASE_URL = "https://fapi.binance.com/fapi/v1/depth";
const DEFAULT_WS_BASE_URL = "wss://fstream.binance.com/public/stream";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeWebSocket(url: string): BinanceUsdmWebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("This runtime does not provide the WebSocket API");
  }
  return new globalThis.WebSocket(url) as unknown as BinanceUsdmWebSocket;
}

function makeFetch(url: string, init: { signal: AbortSignal }): Promise<BinanceUsdmFetchResponse> {
  if (typeof globalThis.fetch !== "function") throw new Error("This runtime does not provide fetch");
  return globalThis.fetch(url, init);
}

function parseWireMessage(data: unknown): unknown {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data);
  } else if (ArrayBuffer.isView(data)) {
    text = new TextDecoder().decode(data as ArrayBufferView);
  } else {
    throw new TypeError("Unsupported WebSocket message payload");
  }

  const parsed: unknown = JSON.parse(text);
  if (isRecord(parsed) && "data" in parsed) return parsed.data;
  return parsed;
}

function depthStreamUrl(baseUrl: string, symbol: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("streams", symbol.toLowerCase() + "@depth@100ms");
  return url.toString();
}

function snapshotUrl(baseUrl: string, symbol: string, limit: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

/**
 * Public USDⓈ-M Futures depth adapter. It uses the exchange WebSocket and
 * unauthenticated REST depth endpoint; it has no private API or order methods.
 */
export class BinanceUsdmMarketDataAdapter {
  readonly symbol: string;
  private readonly synchronizer: BinanceUsdmDepthBookSynchronizer;
  private readonly options: Required<Pick<
    BinanceUsdmMarketDataOptions,
    | "websocketBaseUrl"
    | "restBaseUrl"
    | "snapshotLimit"
    | "staleAfterMs"
    | "snapshotTimeoutMs"
    | "connectionTimeoutMs"
    | "reconnectBaseDelayMs"
    | "reconnectMaxDelayMs"
  >> & BinanceUsdmMarketDataOptions;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => Timer;
  private readonly clearTimerImpl: (timer: Timer) => void;
  private socket: BinanceUsdmWebSocket | undefined;
  private connectionId = 0;
  private running = false;
  private reconnectAttempt = 0;
  private connectTimer: Timer | undefined;
  private staleTimer: Timer | undefined;
  private reconnectTimer: Timer | undefined;
  private snapshotController: AbortController | undefined;
  private currentState: BinanceUsdmMarketDataState;

  constructor(symbol: string, options: BinanceUsdmMarketDataOptions = {}) {
    if (typeof symbol !== "string" || !/^[A-Za-z0-9_]{1,30}$/.test(symbol.trim())) {
      throw new TypeError("A valid Binance USDⓈ-M symbol is required");
    }
    const snapshotLimit = options.snapshotLimit ?? 1000;
    if (![5, 10, 20, 50, 100, 500, 1000].includes(snapshotLimit)) {
      throw new RangeError("snapshotLimit must be supported by the Binance depth endpoint");
    }
    const positiveOptions = [
      options.staleAfterMs ?? 2500,
      options.snapshotTimeoutMs ?? 10_000,
      options.connectionTimeoutMs ?? 10_000,
      options.reconnectBaseDelayMs ?? 250,
      options.reconnectMaxDelayMs ?? 30_000,
    ];
    if (positiveOptions.some((value) => !Number.isSafeInteger(value) || value < 1)) {
      throw new RangeError("Timeout and reconnect options must be positive safe integers");
    }
    if ((options.reconnectMaxDelayMs ?? 30_000) < (options.reconnectBaseDelayMs ?? 250)) {
      throw new RangeError("reconnectMaxDelayMs must be at least reconnectBaseDelayMs");
    }

    const websocketBaseUrl = options.websocketBaseUrl ?? DEFAULT_WS_BASE_URL;
    const restBaseUrl = options.restBaseUrl ?? DEFAULT_REST_BASE_URL;
    if (new URL(websocketBaseUrl).protocol !== "wss:") {
      throw new TypeError("The Binance market-data WebSocket must use wss://");
    }
    if (new URL(restBaseUrl).protocol !== "https:") {
      throw new TypeError("The Binance REST endpoint must use https://");
    }

    this.symbol = symbol.trim().toUpperCase();
    this.options = {
      ...options,
      websocketBaseUrl,
      restBaseUrl,
      snapshotLimit,
      staleAfterMs: options.staleAfterMs ?? 2500,
      snapshotTimeoutMs: options.snapshotTimeoutMs ?? 10_000,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 10_000,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 250,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 30_000,
    };
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimeoutImpl ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimerImpl = options.clearTimeoutImpl ?? ((timer) => clearTimeout(timer));
    this.synchronizer = new BinanceUsdmDepthBookSynchronizer(this.symbol);
    this.currentState = {
      symbol: this.symbol,
      status: "stopped",
      transportConnected: false,
      reconnectAttempt: 0,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    if (!this.running && this.currentState.status === "stopped") return;
    this.running = false;
    this.connectionId += 1;
    this.clearPendingTimers();
    this.snapshotController?.abort();
    this.snapshotController = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.synchronizer.reset();
    if (socket && socket.readyState < 2) socket.close(1000, "adapter stopped");
    this.publish("stopped");
  }

  getState(): BinanceUsdmMarketDataState {
    const state = { ...this.currentState };
    if (state.status === "synchronized") {
      const book = this.synchronizer.getBook();
      const receivedAt = book?.lastReceivedAtMs;
      if (
        !book ||
        receivedAt === undefined ||
        this.now() < receivedAt ||
        this.now() - receivedAt > this.options.staleAfterMs
      ) {
        return {
          ...state,
          status: "stale",
          reason: "Depth data is stale or has an invalid local timestamp",
        };
      }
    }
    return state;
  }

  /** Returns undefined unless transport, snapshot, sequence, and freshness are all valid. */
  getBook(nowMs = this.now()): SynchronizedDepthBook | undefined {
    if (!this.running || this.socket?.readyState !== SOCKET_OPEN) return undefined;
    const book = this.synchronizer.getBook();
    if (!book || !Number.isSafeInteger(nowMs) || nowMs < book.lastReceivedAtMs) return undefined;
    if (nowMs - book.lastReceivedAtMs > this.options.staleAfterMs) return undefined;
    return book;
  }

  private connect(): void {
    if (!this.running || this.socket || this.reconnectTimer) return;
    this.synchronizer.reset();
    this.publish("connecting");
    const connectionId = ++this.connectionId;
    let socket: BinanceUsdmWebSocket;
    try {
      const url = depthStreamUrl(this.options.websocketBaseUrl, this.symbol);
      socket = (this.options.websocketFactory ?? makeWebSocket)(url);
    } catch (error) {
      this.failAndReconnect(this.errorMessage(error));
      return;
    }
    this.socket = socket;
    this.connectTimer = this.setTimer(() => {
      if (this.isCurrent(socket, connectionId) && socket.readyState !== SOCKET_OPEN) {
        this.failAndReconnect("WebSocket open timed out", socket, connectionId);
      }
    }, this.options.connectionTimeoutMs);

    socket.addEventListener("open", () => {
      if (!this.isCurrent(socket, connectionId)) return;
      this.clearTimerField("connectTimer");
      this.synchronizer.reset();
      this.publish("buffering");
      this.fetchAndInstallSnapshot(socket, connectionId);
    });
    socket.addEventListener("message", (event) => {
      if (!this.isCurrent(socket, connectionId)) return;
      this.handleMessage(socket, connectionId, event?.data);
    });
    socket.addEventListener("error", () => {
      if (this.isCurrent(socket, connectionId)) {
        this.failAndReconnect("WebSocket transport error", socket, connectionId);
      }
    });
    socket.addEventListener("close", () => {
      if (this.isCurrent(socket, connectionId)) {
        this.failAndReconnect("WebSocket connection closed", socket, connectionId);
      }
    });
  }

  private handleMessage(socket: BinanceUsdmWebSocket, connectionId: number, payload: unknown): void {
    let event: unknown;
    try {
      event = parseWireMessage(payload);
    } catch (error) {
      this.failAndReconnect("Malformed WebSocket payload: " + this.errorMessage(error), socket, connectionId);
      return;
    }

    const syncState = this.synchronizer.ingest(event, this.now());
    if (syncState.status === "resync-required") {
      this.failAndReconnect(syncState.reason ?? "Depth synchronization requires a fresh snapshot", socket, connectionId);
      return;
    }

    const book = this.synchronizer.getBook();
    if (book) {
      this.reconnectAttempt = 0;
      this.publish("synchronized");
      this.scheduleStaleCheck(socket, connectionId, book.lastReceivedAtMs);
      try {
        this.options.onBook?.(book);
      } catch {
        // A consumer callback must not interrupt transport monitoring.
      }
    } else {
      this.publish("buffering");
    }
  }

  private async fetchAndInstallSnapshot(socket: BinanceUsdmWebSocket, connectionId: number): Promise<void> {
    const controller = new AbortController();
    this.snapshotController?.abort();
    this.snapshotController = controller;
    const timeout = this.setTimer(() => controller.abort(), this.options.snapshotTimeoutMs);
    const url = snapshotUrl(this.options.restBaseUrl, this.symbol, this.options.snapshotLimit);
    try {
      const response = await (this.options.fetchImpl ?? makeFetch)(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Binance depth endpoint returned HTTP " + response.status);
      const snapshot = await response.json();
      if (!this.isCurrent(socket, connectionId)) return;

      const syncState = this.synchronizer.installSnapshot(snapshot, this.now());
      if (syncState.status === "resync-required") {
        this.failAndReconnect(syncState.reason ?? "Snapshot reconciliation failed", socket, connectionId);
        return;
      }
      const book = this.synchronizer.getBook();
      if (book) {
        this.reconnectAttempt = 0;
        this.publish("synchronized");
        this.scheduleStaleCheck(socket, connectionId, book.lastReceivedAtMs);
        try {
          this.options.onBook?.(book);
        } catch {
          // A consumer callback must not interrupt transport monitoring.
        }
      } else {
        this.publish("buffering");
      }
    } catch (error) {
      if (this.isCurrent(socket, connectionId)) {
        const reason = controller.signal.aborted
          ? "Binance depth snapshot request timed out or was aborted"
          : "Binance depth snapshot failed: " + this.errorMessage(error);
        this.failAndReconnect(reason, socket, connectionId);
      }
    } finally {
      this.clearTimerImpl(timeout);
      if (this.snapshotController === controller) this.snapshotController = undefined;
    }
  }

  private scheduleStaleCheck(
    socket: BinanceUsdmWebSocket,
    connectionId: number,
    lastReceivedAtMs: number,
  ): void {
    this.clearTimerField("staleTimer");
    const elapsed = this.now() - lastReceivedAtMs;
    const delay = Math.max(1, this.options.staleAfterMs - elapsed + 1);
    this.staleTimer = this.setTimer(() => {
      if (!this.isCurrent(socket, connectionId)) return;
      const book = this.synchronizer.getBook();
      if (!book) return;
      if (this.now() < book.lastReceivedAtMs || this.now() - book.lastReceivedAtMs > this.options.staleAfterMs) {
        this.publish("stale", "Depth update heartbeat expired");
        this.failAndReconnect("Depth update heartbeat expired", socket, connectionId);
        return;
      }
      this.scheduleStaleCheck(socket, connectionId, book.lastReceivedAtMs);
    }, delay);
  }

  private failAndReconnect(reason: string, expectedSocket?: BinanceUsdmWebSocket, expectedId?: number): void {
    if (!this.running) return;
    if (expectedSocket && !this.isCurrent(expectedSocket, expectedId)) return;
    const socket = this.socket;
    this.socket = undefined;
    this.connectionId += 1;
    this.clearPendingTimers();
    this.snapshotController?.abort();
    this.snapshotController = undefined;
    this.synchronizer.reset();
    if (socket && socket.readyState < 2) {
      try {
        socket.close(4000, "depth feed invalidated");
      } catch {
        // A failed close must not prevent book invalidation or the reconnect timer.
      }
    }

    this.reconnectAttempt += 1;
    this.publish("reconnecting", reason);
    const exponent = Math.min(this.reconnectAttempt - 1, 20);
    const delay = Math.min(
      this.options.reconnectMaxDelayMs,
      this.options.reconnectBaseDelayMs * 2 ** exponent,
    );
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private publish(status: BinanceUsdmAdapterStatus, reason?: string): void {
    const syncState = this.synchronizer.getState();
    this.currentState = {
      symbol: this.symbol,
      status,
      transportConnected: this.socket?.readyState === SOCKET_OPEN,
      reconnectAttempt: this.reconnectAttempt,
      ...(syncState.lastReceivedAtMs !== undefined ? { lastReceivedAtMs: syncState.lastReceivedAtMs } : {}),
      ...(syncState.lastUpdateId !== undefined ? { lastUpdateId: syncState.lastUpdateId } : {}),
      ...(reason ? { reason } : syncState.reason ? { reason: syncState.reason } : {}),
    };
    try {
      this.options.onStateChange?.({ ...this.currentState });
    } catch {
      // A state observer must not interrupt transport monitoring.
    }
  }

  private isCurrent(socket: BinanceUsdmWebSocket, connectionId?: number): boolean {
    return (
      this.running &&
      this.socket === socket &&
      (connectionId === undefined || this.connectionId === connectionId)
    );
  }

  private clearPendingTimers(): void {
    this.clearTimerField("connectTimer");
    this.clearTimerField("staleTimer");
    this.clearTimerField("reconnectTimer");
  }

  private clearTimerField(field: "connectTimer" | "staleTimer" | "reconnectTimer"): void {
    const timer = this[field];
    if (timer !== undefined) {
      this.clearTimerImpl(timer);
      this[field] = undefined;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
  }
}
