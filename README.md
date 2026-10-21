# Consensus Signal — dreamDEX perps bot

Trades a dreamDEX perp only when independent price sources agree, in the spirit of Somnia Agents' validator consensus. Coinbase, Kraken and OKX each vote on direction from their own 5-minute candles (last close vs SMA). A trade needs `QUORUM` agreeing votes. The external median must also sit within `MAX_DEVIATION_BPS` of the dreamDEX mark, so the bot never trades into a broken oracle.

Built for the Somnia **dreamDEX Perps Builder Bounty** with [`@somnia-chain/markets-sdk`](https://www.npmjs.com/package/@somnia-chain/markets-sdk) 0.32.1. It runs on the **Hideki testnet** (chain 50383), where app.testnet.dreamdex.io lives. Order sizes are the market minimum.

## Setup
```bash
git clone https://github.com/icohangar-ops/consensus-signal && cd consensus-signal
npm install
cp .env.example .env        # PRIVATE_KEY of a throwaway Hideki testnet wallet
```
The wallet needs:
- a little STT for gas, from the Somnia faucet.
- USDso in its dreamDEX MarginBank: deposit in the app, or call `trader.depositMargin`.

```bash
npm run dry                 # DRY_RUN=true: logs intended orders, sends nothing
DRY_RUN=false HOLD_SEC=10 npm start   # live
```
Each live order is appended to `txs.jsonl` (kind, tag, symbol, size, tx hash).

### Config (env)
`SYMBOL` (ETH, BTC or SOL), `QUORUM` (2), `LOOKBACK` (12 candles), `MAX_DEVIATION_BPS` (75), `HOLD_SEC` (20), `KEEP` (true keeps the position instead of exiting)

## How it works
- `src/lib.ts` connects `SomniaMarkets` to Hideki (RPC `https://api.hideki2.infra.testnet.somnia.network`, indexer `https://hideki-dev.smk.somnia.host/v1/graphql`).
- `src/perp.ts` holds thin helpers: place (limit or IOC), cancel, close, position and margin reads, all tick- and lot-aligned.
- `src/bot.ts` holds the strategy.

## Real testnet run (Hideki, 2026-10-21 UTC)
All 3 sources voted long, and the external median was 4.3 bps from the dreamDEX mid. The bot went long the 0.004 ETH minimum and exited 10 s later.

Account `0xdFAFacBA862d1a9d6fb94eCE7842E95e7091DCbD`

| action | tag | market | size | tx hash |
|---|---|---|---|---|
| place market long | consensus-3L/0S | ETH/USDso:USDso | 0.004 | `0xf2036e109ca46e493560382f2b7a3a2f401f2167a8e4b196074c5b1cef9a484c` |
| place market short | consensus-exit | ETH/USDso:USDso | 0.004 | `0xb40b764b77d5e9c2f7dee9423e3ee5dfc20af57dd594e3059951df311a8827b7` |

Verify any of these with `eth_getTransactionReceipt` against `https://api.hideki2.infra.testnet.somnia.network`.

## Disclaimer
This is testnet software, not financial advice. Never put a mainnet key in `.env`.
