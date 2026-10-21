// consensus-signal: trades a dreamDEX perp only when independent price sources agree.
// Each source (Coinbase, Kraken, OKX) votes on direction from its own recent candles
// (close vs SMA). A trade needs QUORUM agreeing votes AND the external median must be within
// MAX_DEVIATION_BPS of the dreamDEX mark (no trading into a broken oracle).
import { place, close, position, mid, minQty, market } from "./perp.ts";
const env = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
const SYMBOL = process.env.SYMBOL ?? "ETH"; // ETH | BTC | SOL
const QUORUM = env("QUORUM", 2), LOOKBACK = env("LOOKBACK", 12), MAX_DEV = env("MAX_DEVIATION_BPS", 75);
const HOLD = env("HOLD_SEC", 20);
const pairs: any = { ETH: ["ETH-USD", "XETHZUSD:ETHUSD", "ETH-USDT"], BTC: ["BTC-USD", "XXBTZUSD:XBTUSD", "BTC-USDT"], SOL: ["SOL-USD", "SOLUSD:SOLUSD", "SOL-USDT"] }[SYMBOL];
const get = async (u: string) => (await fetch(u, { headers: { "user-agent": "consensus-signal" } })).json();
async function coinbase() { const c = await get(`https://api.exchange.coinbase.com/products/${pairs[0]}/candles?granularity=300`); return c.slice(0, LOOKBACK).map((x: any) => x[4]).reverse(); }
async function kraken() { const [k, q] = pairs[1].split(":"); const r = await get(`https://api.kraken.com/0/public/OHLC?pair=${q}&interval=5`); const rows = Object.values(r.result).find(Array.isArray) as any[]; return rows.slice(-LOOKBACK).map((x) => Number(x[4])); }
async function okx() { const r = await get(`https://www.okx.com/api/v5/market/candles?instId=${pairs[2]}&bar=5m&limit=${LOOKBACK}`); return r.data.map((x: any) => Number(x[4])).reverse(); }
const votes: { src: string; last: number; vote: number }[] = [];
for (const [src, f] of [["coinbase", coinbase], ["kraken", kraken], ["okx", okx]] as const) {
  try { const c = await f(); const sma = c.reduce((a: number, b: number) => a + b, 0) / c.length; const last = c[c.length - 1]; votes.push({ src, last, vote: last > sma ? 1 : last < sma ? -1 : 0 }); }
  catch (e) { console.log(`${src} unavailable: ${String(e).slice(0, 80)}`); }
}
const median = votes.map((v) => v.last).sort((a, b) => a - b)[Math.floor(votes.length / 2)];
const { bid, ask, mid: dex } = await mid(SYMBOL);
const devBps = Math.abs(median - dex) / dex * 1e4;
const longs = votes.filter((v) => v.vote > 0).length, shorts = votes.filter((v) => v.vote < 0).length;
console.log("votes", votes, `median=${median} dexMid=${dex} deviation=${devBps.toFixed(1)}bps`);
let side: "long" | "short" | null = longs >= QUORUM ? "long" : shorts >= QUORUM ? "short" : null;
if (devBps > MAX_DEV) { console.log(`external consensus deviates ${devBps.toFixed(1)}bps from dreamDEX mark > ${MAX_DEV}; standing aside`); side = null; }
if (!side) { console.log("no consensus -> no trade"); process.exit(0); }
await market(SYMBOL);
const px = side === "long" ? (ask ?? dex) * 1.01 : (bid ?? dex) * 0.99;
await place(SYMBOL, side, await minQty(SYMBOL), px, "market", `consensus-${longs}L/${shorts}S`);
console.log(`holding ${HOLD}s then exiting`); await new Promise((r) => setTimeout(r, HOLD * 1000));
if (process.env.KEEP !== "true") await close(SYMBOL, "consensus-exit");
console.log("position now", (await position(SYMBOL) as any).size);
process.exit(0);
