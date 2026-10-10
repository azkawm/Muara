# Muara

Project context for Ethereum Jakarta Hackathon 2026 (RWA track). Read this first.

## Working preferences
- Decide architecture before writing code: folder structure, library choices, language, and design language/tokens are settled first, then implementation.
- Do not use em dashes or hyphens as sentence separators in prose.
- Keep explanations short; code output can be delivered without commentary when asked.

## One-liner
Muara is a two-sided lending market for tokenized stocks: long holders unlock cash without selling, short sellers get stock supply, and each side's collateral protects the other. Tagline: "Every chain flows to one registry."

## Context
- Tokenized US stocks are already sold to Indonesian users through local exchanges. OJK is drafting rules for tokenized asset offerings. Indonesian (IDX) stock tokens are not live yet.
- Launch market: NVDA is the only live market; AAPL, TSLA, MSFT, SPY are config placeholders shown as "coming soon". Design is asset-agnostic so IDX tokens plug in later via config.
- Muara uses the actual stock tokens (ERC-20 with transfer allowlist), not mirrors of KSEI-held shares.

## Core business model
- Stock holder: locks stock tokens as collateral, borrows USDC. Their stock can be lent to short sellers, and the borrow fee offsets their interest cost ("collateral that works").
- Short seller: locks USDC as collateral, borrows stock tokens, sells them, buys back later, repays.
- USDC supplier: fills USDC liquidity gaps and earns interest.
- Protocol: cut of fees plus liquidation penalties.
- Natural hedge: price up hurts shorts but strengthens holders' collateral; price down does the opposite.
- Yield is paid in USDC by default via `RewardsModule.claimInUsdc` (leaving rewards unclaimed auto-compounds them in the stock token). Dividends are pass-through to the original owner, not extra yield.
- Overcollateralized per asset, e.g. 150% initial, 120% maintenance; volatile assets get stricter ratios.
- Market-hours-aware risk engine: tokens trade 24/7 but the underlying market closes, so raise margin before closes/weekends and pause liquidations on stale prices.
- Sharia filter: owners can mark holdings as not lendable for short selling.

## Cross-chain scope (LayerZero)
- Hub on Base Sepolia holds all lending logic and the single loan book.
- Cross-chain is limited to delivery: users deposit and operate on Base, and can withdraw or receive borrowed funds on Arbitrum Sepolia.
- Implementation: mock USDC and mock stock tokens deployed as native LayerZero OFTs on both chains (burn on Base, mint on Arbitrum). Withdraw takes a destination chain ID; health factor is checked on Base before sending; user pays LayerZero fee (quoteSend).
- Stock token OFT enforces the allowlist on receive.
- Mainnet note: integrate issuers' own cross-chain stock tokens and Circle CCTP for real USDC.

## Demo plan
Characters: Rina (long holder) and Budi (short seller). Numbers are sized for 150% initial / 120% maintenance and verified in `contracts/test/integration/DemoFlow.t.sol`.
0. Before the demo (run the seed a day or more ahead): Rina already has 100 NVDA lent out since seeding, so claimable rewards are waiting for her.
1. Rina deposits 100 more NVDA on Base, borrows 8,000 USDC delivered to Arbitrum, and claims her rewards in USDC.
2. Budi deposits 3,800 USDC on Base, clicks Open short (borrow 50 NVDA and sell at $150 in one call).
3. Scenario A: price falls to $120, Budi clicks Close short (buy back and repay, about +1,459 USDC), withdraws to Arbitrum; Rina's rewards keep growing.
4. Scenario B: price resets to $150, Budi reopens, price spikes to $190 (liquidation from about $188), margin call, keeper bot liquidates; Budi's withdrawal to Arbitrum is blocked by the health check.
5. Show LayerZero Scan and both explorers as proof.
Weekdays only: weekends use the same margin cuts as an ordinary closed session.

## Demo infrastructure
- MockPriceOracle with admin setPrice, optionally starting from a real Pyth price plus a scenario offset. Same interface as a real feed for mainnet swap.
- Mock exchange that swaps stock tokens and USDC at the oracle price minus a small fee, prefunded with liquidity.
- Scenario control panel (admin only): earnings miss -20%, earnings beat +25%, weekend gap, reset. Prices step gradually over 10 to 20 seconds via a script.
- liquidate() callable by anyone; a keeper bot calls it automatically.
- Visible "Simulation mode" badge; be upfront that testnet prices are driven.
- Pre-record a backup video; keep a reset script; pre-fund wallets on both chains.

## UX direction
- Follow Aave-style UX patterns (information architecture and flows), but with Muara's own visual identity. Do not copy Aave's branding, logo, colors, or exact visuals.
- Markets page: table of assets with total supplied, total borrowed, utilization, supply APY, borrow APY, and market status.
- Dashboard: four panels (Your collateral, Your borrows, Assets to supply, Assets to borrow), with net worth, net APY, and a prominent health factor.
- Action modals (supply, borrow, repay, withdraw) with a live preview of the new health factor before confirming.
- Muara-specific additions: Short tab with Open short / Close short and live P&L; destination chain selector (Base or Arbitrum) on withdraw and borrow; market-hours badge per stock (open, closed, weekend); sharia flag toggle on supplied stock; LayerZero delivery status in the transaction history.

## Architecture
Agreed and recorded in `ARCHITECTURE.md` (contracts, LayerZero setup, monorepo layout, libraries, design tokens). Follow it; propose changes before deviating.

## Next step
Contracts are deployed, verified and seeded on Base Sepolia and Arbitrum Sepolia (addresses in `packages/shared/deployments/`, deploy runbook in `ARCHITECTURE.md`). Deployer env vars are `PRIVATE_KEY` and `ADDRESS` in `contracts/.env`. Backend (`apps/backend`: prices, keeper, indexer, admin API, `pnpm admin` CLI) is verified on a fork and runs live; keeper, price updater, Rina and Budi each hold 0.01 Base Sepolia ETH. VPS files are in `deploy/`. Frontend (`apps/web`) is built: typecheck and production build pass; run `pnpm --filter @muara/web dev` with the backend running. Next: click-through test with a wallet, then VPS deploy.
