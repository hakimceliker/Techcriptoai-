import type { Decision } from "./types.ts";
import type { BinanceUsdmMarketDataState } from "./binance-usdm-market-data.ts";

export type ExecutionInterlockMarketState = Pick<
  BinanceUsdmMarketDataState,
  "symbol" | "status" | "transportConnected" | "lastReceivedAtMs"
>;

export type ExecutionAuthorization = {
  allowed: boolean;
  reasons: string[];
};

export type ExecutionAttempt<T> =
  | { allowed: false; reasons: string[] }
  | { allowed: true; reasons: []; result: T };

export type ExecutionInterlockOptions = {
  minimumConfidence?: number;
  maximumDecisionAgeMs?: number;
  maximumMarketDataAgeMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRiskLevels(decision: Record<string, unknown>): boolean {
  const { side, entry, stop, target1, target2 } = decision;
  if (![entry, stop, target1, target2].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    return false;
  }
  const entryPrice = entry as number;
  const stopPrice = stop as number;
  const firstTarget = target1 as number;
  const secondTarget = target2 as number;
  if (side === "LONG") return stopPrice < entryPrice && firstTarget > entryPrice && secondTarget > firstTarget;
  if (side === "SHORT") return stopPrice > entryPrice && firstTarget < entryPrice && secondTarget < firstTarget;
  return false;
}

/**
 * Fail-closed gate for an application-owned execution callback. It starts
 * disarmed and does not implement or call any exchange order endpoint.
 */
export class ExecutionInterlock {
  private armed = false;
  private readonly minimumConfidence: number;
  private readonly maximumDecisionAgeMs: number;
  private readonly maximumMarketDataAgeMs: number;

  constructor(options: ExecutionInterlockOptions = {}) {
    this.minimumConfidence = options.minimumConfidence ?? 68;
    this.maximumDecisionAgeMs = options.maximumDecisionAgeMs ?? 2500;
    this.maximumMarketDataAgeMs = options.maximumMarketDataAgeMs ?? 2500;
    if (!Number.isFinite(this.minimumConfidence) || this.minimumConfidence < 0 || this.minimumConfidence > 100) {
      throw new RangeError("minimumConfidence must be between 0 and 100");
    }
    if (
      !Number.isSafeInteger(this.maximumDecisionAgeMs) ||
      this.maximumDecisionAgeMs < 1 ||
      !Number.isSafeInteger(this.maximumMarketDataAgeMs) ||
      this.maximumMarketDataAgeMs < 1
    ) {
      throw new RangeError("Freshness limits must be positive safe integers");
    }
  }

  arm(): void {
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
  }

  isArmed(): boolean {
    return this.armed;
  }

  authorize(
    symbol: string,
    decision: unknown,
    marketData: ExecutionInterlockMarketState | unknown,
    decisionCreatedAtMs: number,
    nowMs = Date.now(),
  ): ExecutionAuthorization {
    const reasons: string[] = [];
    if (!this.armed) reasons.push("Execution interlock is disarmed");
    if (typeof symbol !== "string" || symbol.trim().length === 0) reasons.push("Execution symbol is invalid");

    if (!isRecord(decision)) {
      reasons.push("Decision is malformed");
    } else {
      if (decision.side !== "LONG" && decision.side !== "SHORT") reasons.push("Decision does not authorize a directional trade");
      if (decision.fresh !== true) reasons.push("Decision is not marked fresh");
      if (
        typeof decision.confidence !== "number" ||
        !Number.isFinite(decision.confidence) ||
        decision.confidence < this.minimumConfidence ||
        decision.confidence > 100
      ) {
        reasons.push("Decision confidence is below the execution threshold or invalid");
      }
      if (!validRiskLevels(decision)) reasons.push("Decision risk levels are missing or invalid");
    }

    if (!Number.isSafeInteger(nowMs) || nowMs < 0) reasons.push("Current time is invalid");
    if (!Number.isSafeInteger(decisionCreatedAtMs) || decisionCreatedAtMs < 0) {
      reasons.push("Decision timestamp is invalid");
    } else if (Number.isSafeInteger(nowMs)) {
      const age = nowMs - decisionCreatedAtMs;
      if (age < 0 || age > this.maximumDecisionAgeMs) reasons.push("Decision is stale or future-dated");
    }

    if (!isRecord(marketData)) {
      reasons.push("Market data state is malformed");
    } else {
      if (marketData.symbol !== symbol) reasons.push("Market data symbol does not match the decision symbol");
      if (marketData.status !== "synchronized") reasons.push("Market data is not synchronized");
      if (marketData.transportConnected !== true) reasons.push("Market data transport is disconnected");
      if (!Number.isSafeInteger(marketData.lastReceivedAtMs) || (marketData.lastReceivedAtMs as number) < 0) {
        reasons.push("Market data receive timestamp is invalid");
      } else if (Number.isSafeInteger(nowMs)) {
        const age = nowMs - (marketData.lastReceivedAtMs as number);
        if (age < 0 || age > this.maximumMarketDataAgeMs) reasons.push("Market data is stale or future-dated");
      }
    }

    return { allowed: reasons.length === 0, reasons };
  }

  /** Re-checks every gate immediately before calling the supplied execution function. */
  async runIfAuthorized<T>(
    symbol: string,
    decision: Decision | unknown,
    marketData: ExecutionInterlockMarketState | unknown,
    decisionCreatedAtMs: number,
    execute: () => T | Promise<T>,
    nowMs = Date.now(),
  ): Promise<ExecutionAttempt<T>> {
    const authorization = this.authorize(symbol, decision, marketData, decisionCreatedAtMs, nowMs);
    if (!authorization.allowed) return { allowed: false, reasons: authorization.reasons };
    const result = await execute();
    return { allowed: true, reasons: [], result };
  }
}
