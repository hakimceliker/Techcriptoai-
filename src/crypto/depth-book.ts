export type DepthLevel = readonly [price: string, quantity: string];

export type BinanceUsdmDepthUpdate = {
  s: string;
  U: number;
  u: number;
  pu: number;
  E: number;
  b: readonly DepthLevel[];
  a: readonly DepthLevel[];
};

export type BinanceUsdmDepthSnapshot = {
  symbol?: string;
  lastUpdateId: number;
  E?: number;
  T?: number;
  bids: readonly DepthLevel[];
  asks: readonly DepthLevel[];
};

export type DepthSyncStatus = "buffering" | "synchronized" | "resync-required";

export type DepthSyncState = {
  symbol: string;
  status: DepthSyncStatus;
  bufferedUpdateCount: number;
  reason?: string;
  lastUpdateId?: number;
  lastExchangeEventTime?: number;
  lastReceivedAtMs?: number;
};

export type SynchronizedDepthBook = {
  symbol: string;
  coverage: "snapshot-limited";
  lastUpdateId: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastExchangeEventTime?: number;
  lastReceivedAtMs: number;
};

type Decimal = { canonical: string; coefficient: bigint; scale: number };
type ParsedLevel = readonly [price: string, quantity: string];
type ParsedUpdate = BinanceUsdmDepthUpdate;
type BufferedUpdate = { update: ParsedUpdate; receivedAtMs: number };
type ParsedSnapshot = {
  lastUpdateId: number;
  eventTime?: number;
  bids: ParsedLevel[];
  asks: ParsedLevel[];
};

const MAX_DECIMAL_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpdateId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseDecimal(value: unknown, allowZero: boolean): Decimal | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DECIMAL_LENGTH) return undefined;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined;

  const [rawInteger, rawFraction = ""] = value.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  const coefficient = BigInt(integer + fraction);
  if (!allowZero && coefficient === 0n) return undefined;

  return {
    canonical: fraction.length > 0 ? integer + "." + fraction : integer,
    coefficient,
    scale: fraction.length,
  };
}

function compareDecimals(a: string, b: string): number {
  const left = parseDecimal(a, true)!;
  const right = parseDecimal(b, true)!;
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightValue = right.coefficient * 10n ** BigInt(scale - right.scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function parseLevels(value: unknown, allowZeroQuantity: boolean): ParsedLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const levels: ParsedLevel[] = [];
  const seen = new Set<string>();

  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2) return undefined;
    const price = parseDecimal(row[0], false);
    const quantity = parseDecimal(row[1], allowZeroQuantity);
    if (!price || !quantity || seen.has(price.canonical)) return undefined;
    seen.add(price.canonical);
    levels.push([price.canonical, quantity.canonical]);
  }

  return levels;
}

function parseSnapshot(value: unknown, expectedSymbol: string): ParsedSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (value.symbol !== undefined && (typeof value.symbol !== "string" || value.symbol.toUpperCase() !== expectedSymbol)) {
    return undefined;
  }
  if (!isUpdateId(value.lastUpdateId)) return undefined;
  if (value.E !== undefined && !isTimestamp(value.E)) return undefined;
  if (value.T !== undefined && !isTimestamp(value.T)) return undefined;

  const bids = parseLevels(value.bids, false);
  const asks = parseLevels(value.asks, false);
  if (!bids || !asks || bids.length === 0 || asks.length === 0) return undefined;

  return {
    lastUpdateId: value.lastUpdateId,
    eventTime: typeof value.E === "number" ? value.E : typeof value.T === "number" ? value.T : undefined,
    bids,
    asks,
  };
}

function parseUpdate(value: unknown, expectedSymbol: string): ParsedUpdate | undefined {
  if (!isRecord(value) || typeof value.s !== "string" || value.s.toUpperCase() !== expectedSymbol) return undefined;
  if (!isUpdateId(value.U) || !isUpdateId(value.u) || !isUpdateId(value.pu) || value.U > value.u) return undefined;
  if (!isTimestamp(value.E)) return undefined;

  const bids = parseLevels(value.b, true);
  const asks = parseLevels(value.a, true);
  if (!bids || !asks) return undefined;

  return { s: expectedSymbol, U: value.U, u: value.u, pu: value.pu, E: value.E, b: bids, a: asks };
}

function isReceivedAt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Pure USDⓈ-M Futures diff-depth synchronizer.
 * It has no network, timer, credential, or order-execution behavior.
 */
export class BinanceUsdmDepthBookSynchronizer {
  private readonly symbol: string;
  private readonly maxBufferedUpdates: number;
  private readonly maxBookLevelsPerSide: number;
  private buffered: BufferedUpdate[] = [];
  private bids = new Map<string, string>();
  private asks = new Map<string, string>();
  private status: DepthSyncStatus = "buffering";
  private reason: string | undefined;
  private snapshotInstalled = false;
  private lastUpdateId: number | undefined;
  private lastExchangeEventTime: number | undefined;
  private lastReceivedAtMs: number | undefined;

  constructor(
    symbol: string,
    options: { maxBufferedUpdates?: number; maxBookLevelsPerSide?: number } = {},
  ) {
    if (typeof symbol !== "string" || symbol.trim().length === 0) {
      throw new TypeError("A non-empty Binance symbol is required");
    }
    const maxBufferedUpdates = options.maxBufferedUpdates ?? 10_000;
    const maxBookLevelsPerSide = options.maxBookLevelsPerSide ?? 10_000;
    if (!Number.isSafeInteger(maxBufferedUpdates) || maxBufferedUpdates < 1) {
      throw new RangeError("maxBufferedUpdates must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maxBookLevelsPerSide) || maxBookLevelsPerSide < 1) {
      throw new RangeError("maxBookLevelsPerSide must be a positive safe integer");
    }

    this.symbol = symbol.trim().toUpperCase();
    this.maxBufferedUpdates = maxBufferedUpdates;
    this.maxBookLevelsPerSide = maxBookLevelsPerSide;
  }

  getState(): DepthSyncState {
    return {
      symbol: this.symbol,
      status: this.status,
      bufferedUpdateCount: this.buffered.length,
      ...(this.reason ? { reason: this.reason } : {}),
      ...(this.lastUpdateId !== undefined ? { lastUpdateId: this.lastUpdateId } : {}),
      ...(this.lastExchangeEventTime !== undefined ? { lastExchangeEventTime: this.lastExchangeEventTime } : {}),
      ...(this.lastReceivedAtMs !== undefined ? { lastReceivedAtMs: this.lastReceivedAtMs } : {}),
    };
  }

  /** Returns no book until snapshot overlap and all buffered sequence links are verified. */
  getBook(): SynchronizedDepthBook | undefined {
    if (
      this.status !== "synchronized" ||
      this.lastUpdateId === undefined ||
      this.lastReceivedAtMs === undefined
    ) {
      return undefined;
    }

    const bids = [...this.bids.entries()]
      .sort(([a], [b]) => compareDecimals(b, a))
      .map(([price, quantity]) => [price, quantity] as const);
    const asks = [...this.asks.entries()]
      .sort(([a], [b]) => compareDecimals(a, b))
      .map(([price, quantity]) => [price, quantity] as const);

    return {
      symbol: this.symbol,
      coverage: "snapshot-limited",
      lastUpdateId: this.lastUpdateId,
      bids,
      asks,
      ...(this.lastExchangeEventTime !== undefined ? { lastExchangeEventTime: this.lastExchangeEventTime } : {}),
      lastReceivedAtMs: this.lastReceivedAtMs,
    };
  }

  /** Buffer a decoded Binance depth event, or apply it if the book is synchronized. */
  ingest(event: unknown, receivedAtMs = Date.now()): DepthSyncState {
    if (this.status === "resync-required") return this.getState();
    if (!isReceivedAt(receivedAtMs)) {
      this.requireResync("Invalid local receive timestamp");
      return this.getState();
    }

    const update = parseUpdate(event, this.symbol);
    if (!update) {
      this.requireResync("Malformed depth update or symbol mismatch");
      return this.getState();
    }

    if (this.status === "synchronized") {
      if (this.lastUpdateId === undefined) {
        this.requireResync("Synchronized state is missing its update ID");
        return this.getState();
      }
      if (update.u <= this.lastUpdateId) return this.getState();
      if (update.pu !== this.lastUpdateId) {
        this.requireResync("Depth sequence gap: pu does not match the previous u");
        return this.getState();
      }
      this.apply(update, receivedAtMs);
      return this.getState();
    }

    if (this.buffered.length >= this.maxBufferedUpdates) {
      this.requireResync("Depth update buffer limit exceeded");
      return this.getState();
    }
    this.buffered.push({ update, receivedAtMs });
    if (this.snapshotInstalled) this.reconcileBuffered();
    return this.getState();
  }

  /** Install a REST depth snapshot. A usable book remains hidden until a buffered event overlaps it. */
  installSnapshot(snapshot: unknown, receivedAtMs = Date.now()): DepthSyncState {
    if (!isReceivedAt(receivedAtMs)) {
      this.requireResync("Invalid local snapshot receive timestamp");
      return this.getState();
    }
    const parsed = parseSnapshot(snapshot, this.symbol);
    if (!parsed) {
      this.requireResync("Malformed depth snapshot or symbol mismatch");
      return this.getState();
    }
    if (parsed.bids.length > this.maxBookLevelsPerSide || parsed.asks.length > this.maxBookLevelsPerSide) {
      this.requireResync("Snapshot level limit exceeded");
      return this.getState();
    }

    this.bids = new Map(parsed.bids.map(([price, quantity]) => [price, quantity]));
    this.asks = new Map(parsed.asks.map(([price, quantity]) => [price, quantity]));
    this.lastUpdateId = parsed.lastUpdateId;
    this.lastExchangeEventTime = parsed.eventTime;
    this.lastReceivedAtMs = receivedAtMs;
    this.snapshotInstalled = true;
    this.status = "buffering";
    this.reason = undefined;
    this.reconcileBuffered();
    return this.getState();
  }

  /** Start a fresh buffering epoch after a socket reconnect or detected gap. */
  reset(): DepthSyncState {
    this.buffered = [];
    this.bids.clear();
    this.asks.clear();
    this.status = "buffering";
    this.reason = undefined;
    this.snapshotInstalled = false;
    this.lastUpdateId = undefined;
    this.lastExchangeEventTime = undefined;
    this.lastReceivedAtMs = undefined;
    return this.getState();
  }

  private reconcileBuffered(): void {
    if (!this.snapshotInstalled || this.lastUpdateId === undefined || this.status === "resync-required") return;

    const snapshotUpdateId = this.lastUpdateId;
    let bridgeIndex = -1;
    for (let i = 0; i < this.buffered.length; i += 1) {
      const update = this.buffered[i].update;
      if (update.u < snapshotUpdateId) continue;
      if (update.U <= snapshotUpdateId && update.u >= snapshotUpdateId) {
        bridgeIndex = i;
        break;
      }
      this.requireResync("First depth update does not overlap the REST snapshot");
      return;
    }

    if (bridgeIndex < 0) {
      this.buffered = [];
      return;
    }

    const pending = this.buffered.slice(bridgeIndex);
    this.buffered = [];
    for (let i = 0; i < pending.length; i += 1) {
      const { update, receivedAtMs } = pending[i];
      if (i > 0 && this.lastUpdateId !== undefined && update.u <= this.lastUpdateId) continue;
      if (i > 0 && update.pu !== this.lastUpdateId) {
        this.requireResync("Buffered depth sequence gap: pu does not match the previous u");
        return;
      }
      if (!this.apply(update, receivedAtMs)) return;
    }

    if (this.bids.size === 0 || this.asks.size === 0) {
      this.requireResync("Synchronized depth book has an empty side");
      return;
    }
    this.status = "synchronized";
    this.reason = undefined;
  }

  private apply(update: ParsedUpdate, receivedAtMs: number): boolean {
    this.applyLevels(this.bids, update.b);
    this.applyLevels(this.asks, update.a);
    if (this.bids.size === 0 || this.asks.size === 0) {
      this.requireResync("Depth update emptied one side of the book");
      return false;
    }
    if (this.bids.size > this.maxBookLevelsPerSide || this.asks.size > this.maxBookLevelsPerSide) {
      this.requireResync("Depth book level limit exceeded");
      return false;
    }

    this.lastUpdateId = update.u;
    this.lastExchangeEventTime = update.E;
    this.lastReceivedAtMs = receivedAtMs;
    return true;
  }

  private applyLevels(book: Map<string, string>, levels: readonly ParsedLevel[]): void {
    for (const [price, quantity] of levels) {
      if (quantity === "0") book.delete(price);
      else book.set(price, quantity);
    }
  }

  private requireResync(reason: string): void {
    this.status = "resync-required";
    this.reason = reason;
    this.buffered = [];
    this.bids.clear();
    this.asks.clear();
    this.snapshotInstalled = false;
    this.lastUpdateId = undefined;
    this.lastExchangeEventTime = undefined;
    this.lastReceivedAtMs = undefined;
  }
}
