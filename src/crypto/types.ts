export type Side="LONG"|"SHORT"|"NO_TRADE";
export type MarketInput={symbol:string;ts:number;price:number;emaFast:number;emaSlow:number;rsi:number;volumeZ:number;buyPressure:number;sellPressure:number;bidDepth:number;askDepth:number;longLiq:number;shortLiq:number;atrPct:number;};
export type Signal={module:string;side:Side;score:number;reason:string;ts:number;};
export type Decision={side:Side;confidence:number;reasons:string[];fresh:boolean;entry?:number;stop?:number;target1?:number;target2?:number;};