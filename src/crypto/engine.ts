import type { MarketInput, Signal, Decision, Side } from "./types.ts";

const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const sig = (module: string, side: Side, score: number, reason: string, ts: number): Signal => ({
  module,
  side,
  score: clamp(score),
  reason,
  ts,
});

export function momentum(x: MarketInput): Signal {
  const d = x.emaFast - x.emaSlow;
  if (Math.abs(d) / x.price < 0.00025) {
    return sig("crypto-momentum", "NO_TRADE", 35, "EMA farkı zayıf", x.ts);
  }
  return sig(
    "crypto-momentum",
    d > 0 ? "LONG" : "SHORT",
    clamp(55 + (Math.abs(d) / x.price) * 5000 + x.volumeZ * 6),
    "EMA+hacim momentumu",
    x.ts,
  );
}

export function reversal(x: MarketInput): Signal {
  if (x.rsi < 28 && x.buyPressure > x.sellPressure * 1.12) {
    return sig("reversal-detector", "LONG", 72, "Aşırı satım + alıcı dönüşü", x.ts);
  }
  if (x.rsi > 72 && x.sellPressure > x.buyPressure * 1.12) {
    return sig("reversal-detector", "SHORT", 72, "Aşırı alım + satıcı dönüşü", x.ts);
  }
  return sig("reversal-detector", "NO_TRADE", 40, "Dönüş teyidi yok", x.ts);
}

export function orderbook(x: MarketInput): Signal {
  const ratio = (x.bidDepth + 1) / (x.askDepth + 1);
  if (ratio > 1.25) {
    return sig("orderbook-pressure", "LONG", clamp(55 + (ratio - 1) * 45), "Bid derinliği baskın", x.ts);
  }
  if (ratio < 0.8) {
    return sig("orderbook-pressure", "SHORT", clamp(55 + (1 - ratio) * 45), "Ask derinliği baskın", x.ts);
  }
  return sig("orderbook-pressure", "NO_TRADE", 35, "Order book dengeli", x.ts);
}

export function liquidation(x: MarketInput): Signal {
  const total = x.longLiq + x.shortLiq + 1;
  if (x.shortLiq / total > 0.67) {
    return sig("liquidation-radar", "LONG", 68, "Short likidasyon yoğunluğu", x.ts);
  }
  if (x.longLiq / total > 0.67) {
    return sig("liquidation-radar", "SHORT", 68, "Long likidasyon yoğunluğu", x.ts);
  }
  return sig("liquidation-radar", "NO_TRADE", 35, "Likidasyon üstünlüğü yok", x.ts);
}

export function fakeBreakout(x: MarketInput): Signal {
  const extreme =
    x.volumeZ > 2.2 &&
    Math.abs(x.buyPressure - x.sellPressure) < 0.08 * Math.max(x.buyPressure, x.sellPressure);
  return sig(
    "fake-breakout",
    "NO_TRADE",
    extreme ? 88 : 25,
    extreme ? "Yüksek hacim fakat akış teyitsiz: breakout riski" : "Fake breakout alarmı yok",
    x.ts,
  );
}

const invalidInput = (x: MarketInput, now: number): boolean => {
  const finiteValues = [
    now,
    x.ts,
    x.price,
    x.emaFast,
    x.emaSlow,
    x.rsi,
    x.volumeZ,
    x.buyPressure,
    x.sellPressure,
    x.bidDepth,
    x.askDepth,
    x.longLiq,
    x.shortLiq,
    x.atrPct,
  ];
  return (
    !x.symbol.trim() ||
    finiteValues.some((value) => !Number.isFinite(value)) ||
    x.price <= 0 ||
    x.rsi < 0 ||
    x.rsi > 100 ||
    x.buyPressure < 0 ||
    x.sellPressure < 0 ||
    x.bidDepth < 0 ||
    x.askDepth < 0 ||
    x.longLiq < 0 ||
    x.shortLiq < 0 ||
    x.atrPct < 0
  );
};

export function decide(x: MarketInput, now = Date.now()): Decision {
  if (invalidInput(x, now)) {
    return { side: "NO_TRADE", confidence: 0, reasons: ["Geçersiz piyasa verisi"], fresh: false };
  }

  const age = now - x.ts;
  if (age < 0) {
    return { side: "NO_TRADE", confidence: 0, reasons: ["Veri zaman damgası gelecekte"], fresh: false };
  }
  if (age > 2500) {
    return { side: "NO_TRADE", confidence: 0, reasons: [`Veri eski: ${age}ms`], fresh: false };
  }

  const signals = [momentum(x), reversal(x), orderbook(x), liquidation(x), fakeBreakout(x)];
  if (signals.some((signal) => signal.module === "fake-breakout" && signal.score >= 80)) {
    return { side: "NO_TRADE", confidence: 20, reasons: signals.map((signal) => signal.reason), fresh: true };
  }

  const active = signals.filter((signal) => signal.side !== "NO_TRADE");
  const longScore = active.filter((signal) => signal.side === "LONG").reduce((sum, signal) => sum + signal.score, 0);
  const shortScore = active.filter((signal) => signal.side === "SHORT").reduce((sum, signal) => sum + signal.score, 0);

  if (
    active.length === 0 ||
    (Math.min(longScore, shortScore) > 0 && Math.abs(longScore - shortScore) < 55)
  ) {
    return {
      side: "NO_TRADE",
      confidence: 35,
      reasons: ["Sinyaller çelişkili / yetersiz", ...signals.map((signal) => signal.reason)],
      fresh: true,
    };
  }

  const side: Side = longScore > shortScore ? "LONG" : "SHORT";
  const winningScore = side === "LONG" ? longScore : shortScore;
  const losingScore = side === "LONG" ? shortScore : longScore;
  const confidence = clamp(50 + (winningScore - losingScore) / Math.max(1, active.length));

  if (confidence < 68) {
    return {
      side: "NO_TRADE",
      confidence,
      reasons: ["Minimum güven eşiği aşılmadı", ...signals.map((signal) => signal.reason)],
      fresh: true,
    };
  }

  const risk = x.price * Math.max(0.0015, x.atrPct * 1.15);
  return {
    side,
    confidence,
    reasons: signals.map((signal) => signal.reason),
    fresh: true,
    entry: x.price,
    stop: side === "LONG" ? x.price - risk : x.price + risk,
    target1: side === "LONG" ? x.price + risk * 1.2 : x.price - risk * 1.2,
    target2: side === "LONG" ? x.price + risk * 2 : x.price - risk * 2,
  };
}
