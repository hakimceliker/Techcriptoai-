import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionInterlock } from "../src/crypto/execution-interlock.ts";

const decision = {
  side: "LONG",
  confidence: 82,
  fresh: true,
  entry: 100,
  stop: 99,
  target1: 101,
  target2: 102,
  reasons: [],
};

const marketData = {
  symbol: "BTCUSDT",
  status: "synchronized",
  transportConnected: true,
  lastReceivedAtMs: 10_000,
};

test("execution starts disarmed and does not call the supplied executor", async () => {
  const gate = new ExecutionInterlock();
  let executions = 0;
  const attempt = await gate.runIfAuthorized(
    "BTCUSDT",
    decision,
    marketData,
    10_000,
    () => {
      executions += 1;
      return "sent";
    },
    10_100,
  );

  assert.equal(attempt.allowed, false);
  assert.ok(attempt.reasons.includes("Execution interlock is disarmed"));
  assert.equal(executions, 0);
});

test("armed execution requires matching, synchronized, fresh market data and valid risk levels", async () => {
  const gate = new ExecutionInterlock();
  gate.arm();
  let executions = 0;
  const action = () => {
    executions += 1;
    return "paper-order";
  };

  const unsynchronized = await gate.runIfAuthorized(
    "BTCUSDT",
    decision,
    { ...marketData, status: "buffering" },
    10_000,
    action,
    10_100,
  );
  assert.equal(unsynchronized.allowed, false);
  assert.equal(executions, 0);

  const mismatch = gate.authorize("ETHUSDT", decision, marketData, 10_000, 10_100);
  assert.equal(mismatch.allowed, false);
  assert.ok(mismatch.reasons.includes("Market data symbol does not match the decision symbol"));

  const staleDecision = gate.authorize("BTCUSDT", decision, marketData, 1_000, 10_100);
  assert.equal(staleDecision.allowed, false);

  const invalidRisk = gate.authorize(
    "BTCUSDT",
    { ...decision, target1: 99.5 },
    marketData,
    10_000,
    10_100,
  );
  assert.equal(invalidRisk.allowed, false);

  const allowed = await gate.runIfAuthorized(
    "BTCUSDT",
    decision,
    marketData,
    10_000,
    action,
    10_100,
  );
  assert.deepEqual(allowed, { allowed: true, reasons: [], result: "paper-order" });
  assert.equal(executions, 1);

  gate.disarm();
  assert.equal(gate.isArmed(), false);
});

test("NO_TRADE, stale data, invalid timestamps, and malformed input fail closed", async () => {
  const gate = new ExecutionInterlock();
  gate.arm();
  const noTrade = gate.authorize("BTCUSDT", { ...decision, side: "NO_TRADE" }, marketData, 10_000, 10_100);
  assert.equal(noTrade.allowed, false);

  const staleMarket = gate.authorize(
    "BTCUSDT",
    decision,
    { ...marketData, lastReceivedAtMs: 7_000 },
    10_000,
    10_100,
  );
  assert.equal(staleMarket.allowed, false);

  const futureData = gate.authorize(
    "BTCUSDT",
    decision,
    { ...marketData, lastReceivedAtMs: 10_200 },
    10_000,
    10_100,
  );
  assert.equal(futureData.allowed, false);

  const malformed = await gate.runIfAuthorized(
    "BTCUSDT",
    null,
    null,
    Number.NaN,
    () => assert.fail("executor must not run for malformed input"),
    Number.NaN,
  );
  assert.equal(malformed.allowed, false);
});
