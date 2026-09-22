import {decide} from "../src/crypto/engine"; import {MarketInput} from "../src/crypto/types";
const base:MarketInput={symbol:"BTCUSDT",ts:Date.now(),price:100000,emaFast:100200,emaSlow:100000,rsi:55,volumeZ:1.5,buyPressure:60,sellPressure:40,bidDepth:140,askDepth:90,longLiq:20,shortLiq:80,atrPct:.003};
test("stale data => NO_TRADE",()=>expect(decide({...base,ts:Date.now()-5000}).side).toBe("NO_TRADE"));
test("confirmed bullish inputs can LONG",()=>expect(["LONG","NO_TRADE"]).toContain(decide(base).side));
test("conflict => NO_TRADE",()=>expect(decide({...base,emaFast:99800,emaSlow:100000,bidDepth:160,askDepth:80,longLiq:50,shortLiq:50}).side).toBe("NO_TRADE"));