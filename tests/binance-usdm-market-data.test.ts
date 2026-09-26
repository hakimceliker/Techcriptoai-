import assert from "node:assert/strict";
import test from "node:test";
import {
  BinanceUsdmMarketDataAdapter,
  type BinanceUsdmFetchResponse,
  type BinanceUsdmWebSocket,
} from "../src/crypto/binance-usdm-market-data.ts";

const snapshot = {
  symbol: "BTCUSDT",
  lastUpdateId: 100,
  E: 1_000,
  T: 1_000,
  bids: [["100", "1"]],
  asks: [["101", "2"]],
};

const bridge = {
  s: "BTCUSDT",
  U: 98,
  u: 101,
  pu: 90,
  E: 1_001,
  b: [["100", "3"]],
  a: [],
};

class FakeSocket implements BinanceUsdmWebSocket {
  readyState = 0;
  private listeners = new Map<string, Array<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  open(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  message(data: unknown): void {
    this.emit("message", { data: JSON.stringify({ stream: "btcusdt@depth@100ms", data }) });
  }

  close(): void {
    const wasOpen = this.readyState < 2;
    this.readyState = 3;
    if (wasOpen) this.emit("close", {});
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function response(body: unknown): BinanceUsdmFetchResponse {
  return { ok: true, status: 200, json: async () => body };
}

function makeClock(initialMs = 10_000) {
  let currentMs = initialMs;
  let nextId = 1;
  const timers = new Map<number, { atMs: number; callback: () => void }>();
  return {
    now: () => currentMs,
    setTimeoutImpl: (callback: () => void, delayMs: number) => {
      const id = nextId++;
      timers.set(id, { atMs: currentMs + delayMs, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutImpl: (handle: ReturnType<typeof setTimeout>) => {
      timers.delete(handle as unknown as number);
    },
    advance: (deltaMs: number) => {
      currentMs += deltaMs;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.atMs <= currentMs)
          .sort((a, b) => a[1].atMs - b[1].atMs)[0];
        if (!due) return;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("connects to the public USD-M stream, buffers before REST snapshot, and exposes only reconciled depth", async () => {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  let resolveSnapshot: ((value: BinanceUsdmFetchResponse) => void) | undefined;
  const adapter = new BinanceUsdmMarketDataAdapter("btcusdt", {
    websocketFactory: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    fetchImpl: async (url) => {
      urls.push(url);
      return await new Promise<BinanceUsdmFetchResponse>((resolve) => {
        resolveSnapshot = resolve;
      });
    },
  });

  adapter.start();
  assert.equal(adapter.getState().status, "connecting");
  sockets[0].open();
  sockets[0].message(bridge);
  assert.equal(adapter.getBook(), undefined);
  assert.equal(adapter.getState().status, "buffering");

  resolveSnapshot!(response(snapshot));
  await flushPromises();

  assert.equal(adapter.getState().status, "synchronized");
  assert.equal(adapter.getState().transportConnected, true);
  assert.deepEqual(adapter.getBook()?.bids, [["100", "3"]]);
  assert.equal(adapter.getBook()?.lastUpdateId, 101);
  assert.equal(new URL(urls[0]).pathname, "/public/stream");
  assert.equal(new URL(urls[0]).searchParams.get("streams"), "btcusdt@depth@100ms");
  assert.equal(new URL(urls[1]).pathname, "/fapi/v1/depth");
  assert.equal(new URL(urls[1]).searchParams.get("symbol"), "BTCUSDT");
  assert.equal(new URL(urls[1]).searchParams.get("limit"), "1000");

  adapter.stop();
  assert.equal(adapter.getBook(), undefined);
  assert.equal(adapter.getState().status, "stopped");
});

test("sequence gaps invalidate the book and schedule a new WebSocket/snapshot cycle", async () => {
  const clock = makeClock();
  const sockets: FakeSocket[] = [];
  const snapshots: Array<(value: BinanceUsdmFetchResponse) => void> = [];
  const adapter = new BinanceUsdmMarketDataAdapter("BTCUSDT", {
    websocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    fetchImpl: async () => await new Promise<BinanceUsdmFetchResponse>((resolve) => snapshots.push(resolve)),
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 400,
  });

  adapter.start();
  sockets[0].open();
  sockets[0].message(bridge);
  snapshots[0](response(snapshot));
  await flushPromises();
  assert.equal(adapter.getState().status, "synchronized");

  sockets[0].message({ ...bridge, U: 102, u: 103, pu: 90 });
  assert.equal(adapter.getBook(), undefined);
  assert.equal(adapter.getState().status, "reconnecting");
  assert.match(adapter.getState().reason ?? "", /sequence gap/i);

  clock.advance(100);
  assert.equal(sockets.length, 2);
  sockets[1].open();
  sockets[1].message(bridge);
  snapshots[1](response(snapshot));
  await flushPromises();
  assert.equal(adapter.getState().status, "synchronized");

  adapter.stop();
});

test("stale depth loses availability and reconnects with capped-backoff state", async () => {
  const clock = makeClock();
  const sockets: FakeSocket[] = [];
  const observedStatuses: string[] = [];
  const adapter = new BinanceUsdmMarketDataAdapter("BTCUSDT", {
    websocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    fetchImpl: async () => response(snapshot),
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    staleAfterMs: 2500,
    connectionTimeoutMs: 10_000,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 400,
    onStateChange: (state) => observedStatuses.push(state.status),
  });

  adapter.start();
  sockets[0].open();
  sockets[0].message(bridge);
  await flushPromises();
  assert.ok(adapter.getBook());

  clock.advance(2501);
  assert.equal(adapter.getBook(), undefined);
  assert.equal(adapter.getState().status, "reconnecting");
  assert.ok(observedStatuses.includes("stale"));
  assert.ok(observedStatuses.includes("reconnecting"));

  clock.advance(100);
  assert.equal(sockets.length, 2);
  adapter.stop();
});

test("REST failures keep depth unavailable and enter reconnect backoff", async () => {
  const clock = makeClock();
  const sockets: FakeSocket[] = [];
  const adapter = new BinanceUsdmMarketDataAdapter("BTCUSDT", {
    websocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 400,
  });

  adapter.start();
  sockets[0].open();
  await flushPromises();

  assert.equal(adapter.getBook(), undefined);
  assert.equal(adapter.getState().status, "reconnecting");
  assert.match(adapter.getState().reason ?? "", /HTTP 503/);
  clock.advance(100);
  assert.equal(sockets.length, 2);
  adapter.stop();
});
