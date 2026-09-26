import assert from "node:assert/strict";
import test from "node:test";
import { BinanceUsdmDepthBookSynchronizer } from "../src/crypto/depth-book.ts";

const snapshot = {
  symbol: "BTCUSDT",
  lastUpdateId: 100,
  E: 1_000,
  T: 1_000,
  bids: [["100", "1"], ["99", "2"]],
  asks: [["101", "3"]],
};

const bridge = {
  s: "BTCUSDT",
  U: 98,
  u: 101,
  pu: 90,
  E: 1_001,
  b: [["100.0", "4"], ["99", "0"], ["99.5", "1"]],
  a: [["101", "0"], ["102", "5"]],
};

test("buffers updates and exposes no book until a snapshot overlap is verified", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(sync.getBook(), undefined);
  assert.equal(sync.ingest(bridge, 10_001).status, "buffering");
  assert.equal(sync.getBook(), undefined);

  const state = sync.installSnapshot(snapshot, 10_002);
  assert.equal(state.status, "synchronized");
  const book = sync.getBook();
  assert.ok(book);
  assert.equal(book.coverage, "snapshot-limited");
  assert.equal(book.lastUpdateId, 101);
  assert.deepEqual(book.bids, [["100", "4"], ["99.5", "1"]]);
  assert.deepEqual(book.asks, [["102", "5"]]);
  assert.equal(book.lastReceivedAtMs, 10_001);
});

test("applies later updates only when pu links to the previous u", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  sync.ingest(bridge, 10_001);
  sync.installSnapshot(snapshot, 10_000);

  const state = sync.ingest(
    { s: "BTCUSDT", U: 102, u: 104, pu: 101, E: 1_002, b: [["98", "1"]], a: [] },
    10_003,
  );
  assert.equal(state.status, "synchronized");
  assert.equal(state.lastUpdateId, 104);
  assert.deepEqual(sync.getBook()?.bids, [["100", "4"], ["99.5", "1"], ["98", "1"]]);
});

test("ignores buffered updates older than the REST snapshot, then waits for a bridge", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  sync.ingest({ ...bridge, U: 90, u: 99, pu: 80 }, 10_000);
  assert.equal(sync.installSnapshot(snapshot, 10_001).status, "buffering");
  assert.equal(sync.getBook(), undefined);
  assert.equal(sync.ingest({ ...bridge, U: 99, u: 100, pu: 98 }, 10_002).status, "synchronized");
});

test("requires a new snapshot when the first usable buffered event does not overlap", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  sync.ingest({ ...bridge, U: 101, u: 102, pu: 100 }, 10_000);
  const state = sync.installSnapshot(snapshot, 10_001);
  assert.equal(state.status, "resync-required");
  assert.equal(sync.getBook(), undefined);
});

test("a sequence gap clears the visible book and ignores data until reset", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  sync.ingest(bridge, 10_001);
  sync.installSnapshot(snapshot, 10_000);
  assert.ok(sync.getBook());

  const state = sync.ingest({ ...bridge, U: 102, u: 103, pu: 90 }, 10_002);
  assert.equal(state.status, "resync-required");
  assert.equal(sync.getBook(), undefined);
  assert.equal(sync.ingest(bridge, 10_003).status, "resync-required");

  assert.equal(sync.reset().status, "buffering");
  sync.ingest(bridge, 10_004);
  assert.equal(sync.installSnapshot(snapshot, 10_005).status, "synchronized");
});

test("malformed events, wrong symbols, and buffer overflow fail closed", () => {
  const malformed = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(malformed.ingest({ ...bridge, b: [["NaN", "1"]] }, 10_000).status, "resync-required");
  assert.equal(malformed.getBook(), undefined);

  const wrongSymbol = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(wrongSymbol.ingest({ ...bridge, s: "ETHUSDT" }, 10_000).status, "resync-required");

  const overflow = new BinanceUsdmDepthBookSynchronizer("BTCUSDT", { maxBufferedUpdates: 1 });
  assert.equal(overflow.ingest(bridge, 10_000).status, "buffering");
  assert.equal(overflow.ingest({ ...bridge, u: 102 }, 10_001).status, "resync-required");
  assert.equal(overflow.getBook(), undefined);
});

test("malformed snapshots and unsafe prices are never exposed as a book", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(
    sync.installSnapshot({ ...snapshot, bids: [["0", "1"]] }, 10_000).status,
    "resync-required",
  );
  assert.equal(sync.getBook(), undefined);

  const zeroQuantity = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(
    zeroQuantity.installSnapshot({ ...snapshot, bids: [["100", "0"]] }, 10_000).status,
    "resync-required",
  );

  const duplicatePrices = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  assert.equal(
    duplicatePrices.installSnapshot({ ...snapshot, bids: [["100.0", "1"], ["100", "2"]] }, 10_000).status,
    "resync-required",
  );
});

test("sorts decimal price levels without converting exchange strings to floating point", () => {
  const sync = new BinanceUsdmDepthBookSynchronizer("BTCUSDT");
  sync.ingest({ ...bridge, b: [], a: [] }, 10_000);
  sync.installSnapshot(
    { ...snapshot, bids: [["100.10", "1"], ["100.09", "2"]] },
    10_001,
  );
  assert.deepEqual(sync.getBook()?.bids, [["100.1", "1"], ["100.09", "2"]]);
});
