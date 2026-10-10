# Muara Architecture

Agreed architecture for the Ethereum Jakarta Hackathon 2026 build. Product context lives in `CLAUDE.md`.

## Decisions log

| Topic | Decision |
|---|---|
| Repo | One pnpm + Turborepo monorepo holding contracts, backend and frontend |
| Backend | A single Node service: keeper, price scenarios, admin API, history indexer |
| Lendable default | Stock collateral is lendable by default; the sharia toggle opts out |
| Fee split | Protocol takes 10% of interest and 10% of the liquidation bonus; the rest goes to suppliers |
| Stock utilization cap | 80%, so collateral backing longs can always be seized |
| Assets | NVDA is the only live market. AAPL, TSLA, MSFT, SPY exist in config as placeholders ("coming soon"), not deployed |
| Hosting | Own VPS and domain: Docker Compose with Caddy (auto TLS) serving the web build and proxying the backend |
| Upgradeability | All contracts are non-upgradeable for now: no proxies, plain constructors. Changes ship as redeploys |
| Contract size | Every contract stays under the EIP-170 limit: slim pool, external logic libraries, separate modules, interfaces only across contract boundaries. Layout: `src/core`, `src/modules`, `src/lib`, `src/interfaces` |
| Weekends | Out of scope for the hackathon: weekends use the same margin cuts as a weekday close |
| Rewards | Lenders claim earned interest separately from principal; paid in USDC by default through `RewardsModule` |
| Demo numbers | Rina borrows 8,000 USDC against 100 NVDA; Budi posts 3,800 USDC for a 50 NVDA short |

## 1. Lending model

Muara is a single Aave-style money market on the hub. Every supplied asset is both collateral and lendable liquidity, unless its owner sets the sharia flag on a stock.

- **Long (Rina):** supply NVDA, borrow USDC.
- **Short (Budi):** supply USDC, borrow NVDA, swap it to USDC, supply the proceeds as collateral. `ShortModule` does this in one call.
- **USDC supplier:** supply USDC, earn interest.

Budi's USDC funds Rina's borrow and Rina's NVDA supplies Budi's short, so each side's collateral backs the other.

Risk parameters per asset: 150% initial collateralization (LTV), 120% maintenance (liquidation threshold), liquidation bonus, 50% close factor. Volatile assets get stricter values via config.

## 2. Contracts

### Hub: Base Sepolia

| Contract | Responsibility |
|---|---|
**Core** (`src/core/`)

| Contract | Responsibility |
|---|---|
| `MuaraPool` | Storage, entry points and token custody only. `supply`, `withdraw(asset, amount, dstEid)`, `borrow(asset, amount, dstEid)`, `repay`, `liquidate`, `setLendable(asset, bool)`, `quoteDelivery`. Each entry point validates the caller and delegates to an external logic library. Approved modules can act on behalf of users (delegation). |

**Modules** (`src/modules/`): standalone contracts the pool calls through interfaces

| Contract | Responsibility |
|---|---|
| `RiskEngine` | Per-asset LTV, liquidation threshold, bonus, close factor. Computes health factor. Applies market-hours adjustments: LTV tightens 30 min before close and while closed (the demo config gives weekends the same cuts as a weekday close); the liquidation threshold ramps gradually so positions are not liquidated by a step change. Stale price pauses liquidations and new borrows for that asset. Enforces the 80% stock utilization cap. |
| `InterestRateModel` | Per-asset kinked utilization curve. On stock reserves its output is the short borrow fee. |
| `ShortModule` | `openShort(asset, usdcIn, stockAmount, minUsdcOut)`: supply USDC, borrow stock, swap on the exchange, supply proceeds. `closeShort(asset, stockAmount, maxUsdcIn)`: withdraw USDC, buy stock back, repay. Tracks size and sale proceeds for P&L. Holds no funds between calls. |
| `RewardsModule` | `claimInUsdc(asset, minUsdcOut, to, dstEid)`: claims the caller's earned interest, sells stock rewards for USDC and delivers locally or to Arbitrum. This is the default payout; leaving rewards unclaimed compounds them in the stock. |

**Libraries** (`src/lib/`)

| Library | Linking | Responsibility |
|---|---|---|
| `SupplyLogic` | external | Supply, withdraw, sharia bucket moves, reward claims (earned interest above principal) |
| `BorrowLogic` | external | Borrow, repay, utilization cap check |
| `LiquidationLogic` | external | Close factor, seize amount, bonus split |
| `DeliveryLogic` | external | Local transfer or OFT `send` with dust removal and fee forwarding |
| `ReserveLogic` | internal | Supply and borrow indexes in ray, scaled balances, interest accrual, 10% reserve factor. Stock supply in two buckets, lendable and sharia-locked; only lendable earns borrow fees |
| `HealthLogic` | internal | Health factor and post-action preview math |
| `MarketHours` | internal | NYSE weekly session from `block.timestamp` with admin DST offset, plus demo override (open, closed, weekend) |
| `WadRayMath`, `PercentageMath` | internal | Fixed-point math |
| `DataTypes` | internal | Shared structs (reserve data, user config, params) |
| `Errors` | internal | Custom errors shared across contracts |

**Periphery, oracle, exchange**

| Contract | Responsibility |
|---|---|
| `MuaraLens` (`src/periphery/`) | Read-only aggregator: user positions, health factor, previewed health factor after a hypothetical action, reserve stats, market status, short P&L. Used by frontend and keeper. Kept out of the pool to save bytecode. |
| `MockPriceOracle` (`src/oracle/`) | Implements `IMuaraOracle` with admin `setPrice`. A `PythOracleAdapter` with the same interface is the mainnet swap. |
| `MockExchange` (`src/exchange/`) | Implements `IMuaraExchange`. Swaps stock and USDC at oracle price minus 30 bps. Prefunded with liquidity. |

**Interfaces** (`src/interfaces/`)

`IMuaraPool`, `IRiskEngine`, `IInterestRateModel`, `IShortModule`, `IRewardsModule`, `IMuaraOracle`, `IMuaraExchange`, `IMuaraLens`, `IStockToken`, `IAllowlist`. Events, errors visible to integrators, and structs used across contract boundaries are declared here or in `DataTypes`.

### Both chains: Base Sepolia and Arbitrum Sepolia

| Contract | Responsibility |
|---|---|
| `MockUSDC` | Native LayerZero OFT, 6 decimals, testnet faucet. |
| `StockToken` | Native LayerZero OFT, 18 decimals, transfer allowlist enforced in `_update` and in `_credit` on receive. One deployment per live ticker (NVDA only for now). |
| `Allowlist` | Admin managed list, mirrored on both chains by `scripts/sync-allowlist`. |

### Off-chain

`liquidate()` is permissionless. The keeper in the backend calls it automatically.

### Upgradeability

No proxies anywhere. Every contract uses a constructor and immutable wiring where possible (for example the pool's oracle, risk engine and rate model addresses). Tunable values such as risk parameters, market-hours override, oracle price and allowlist stay as `Ownable` admin setters, since the demo needs them live. A logic change means a redeploy: `demo-reset` already redeploys the hub, and the OFT tokens stay fixed so LayerZero peers survive. Proxies can be introduced before mainnet if needed.

### Contract size (EIP-170) and call boundaries

Every deployed contract must stay under the 24,576 byte runtime limit.

- **Slim pool:** `MuaraPool` keeps storage and entry points only. Heavy flows live in external libraries (`SupplyLogic`, `BorrowLogic`, `LiquidationLogic`, `DeliveryLogic`), deployed once and linked, so their bytecode is not counted in the pool. This is the Aave v3 pattern.
- **Separate modules:** risk, rates and shorts are their own contracts, and all reads for the UI go through `MuaraLens`, so none of that code sits in the pool.
- **Interfaces only across boundaries:** a contract imports another contract's interface from `src/interfaces/`, never its implementation. This keeps bytecode small and makes the oracle, exchange and risk engine swappable by redeploy.
- **Internal libraries** are used only for small pure math and helpers.
- **Custom errors** instead of revert strings.
- **Compiler:** optimizer on, 200 runs; `via_ir` only if stack depth requires it.
- **Guard:** `pnpm contracts:sizes` runs `forge build --sizes`, which fails when any contract exceeds the limit. Current largest: StockToken 13.1 KB, MuaraPool 11.5 KB.
- **Linking:** `forge script` deploys and links the external libraries during `DeployHub` and `RedeployHub`; library addresses are written to `deployments/`.

### Liquidation

Liquidator repays up to the close factor of a debt and receives collateral plus the bonus; 10% of the bonus goes to the protocol reserve. Liquidation is blocked for an asset when its price is stale.

## 3. LayerZero setup

- **OFTs:** `MockUSDC` and each `StockToken` are native OFTs on both chains, peered 1:1. Base Sepolia EID 40245, Arbitrum Sepolia EID 40231. Lending contracts are not OApps; cross-chain is delivery only.
- **Withdraw or borrow to Arbitrum:**
  1. Pool accrues interest and updates state.
  2. Pool checks health factor on Base; reverts if below 1 (this is the Scenario B block).
  3. `dstEid == base`: plain ERC-20 transfer.
  4. Otherwise pool calls `token.send(SendParam{dstEid, to, amountLD, minAmountLD}, fee, refundAddress = user)`. The OFT burns from the pool balance and mints to the user on Arbitrum.
- **Fee flow:** frontend calls `pool.quoteDelivery(asset, amount, dstEid, to)`, which wraps `quoteSend`. User attaches that native ETH as `msg.value`; pool forwards it; excess is refunded by LayerZero to the user. No protocol markup.
- **Enforced options:** `lzReceive` gas 80k for USDC and 150k for stock tokens (allowlist check plus a fresh balance slot ran out of gas at 80k in tests). Default testnet DVNs and executor.
- **Allowlist safety:** recipient is checked against the local mirror before burning, so messages do not get stuck. A failed receive can be retried after allowlisting.
- **Dust:** shared decimals are 6, so 18 decimal stock amounts are truncated to 1e-6. The pool applies `removeDust` before accounting.
- **Delivery status:** backend indexer polls the LayerZero Scan testnet API by tx hash and stores Sent, Verified, Delivered.
- **Out of scope:** deposits from Arbitrum (OFT compose into `supply`) are a stretch goal.
- **Mainnet path:** issuers' own cross-chain stock tokens and Circle CCTP for USDC.

## 4. Monorepo structure

```
muara/
├─ contracts/                    Foundry project, also a pnpm package; all deps (forge-std, OZ, LZ)
│                                come from node_modules, so there is no root lib/ to confuse with src/lib/
│  ├─ src/
│  │  ├─ core/                   MuaraPool
│  │  ├─ modules/                RiskEngine, InterestRateModel, ShortModule, RewardsModule
│  │  ├─ lib/                    SupplyLogic, BorrowLogic, LiquidationLogic, DeliveryLogic (external);
│  │  │                          ReserveLogic, HealthLogic, MarketHours, WadRayMath,
│  │  │                          PercentageMath, DataTypes, Errors (internal)
│  │  ├─ interfaces/             IMuaraPool, IRiskEngine, IInterestRateModel, IShortModule, IRewardsModule,
│  │  │                          IMuaraOracle, IMuaraExchange, IMuaraLens, IStockToken, IAllowlist
│  │  ├─ periphery/              MuaraLens
│  │  ├─ oracle/                 MockPriceOracle
│  │  ├─ exchange/               MockExchange
│  │  └─ tokens/                 MockUSDC, StockToken, Allowlist
│  ├─ script/                    DeployTokens, WireLayerZero, SyncAllowlist, DeployHub, Seed, RedeployHub (.s.sol);
│  │                             lib/MuaraDeploy (shared steps), lib/DemoConfig (params and seed amounts)
│  ├─ test/                      unit/, integration/ (LZ TestHelper), invariant/
│  ├─ foundry.toml
│  └─ remappings.txt
├─ apps/
│  ├─ web/                       React frontend
│  │  └─ src/
│  │     ├─ app/                 providers, router
│  │     ├─ routes/              markets/, dashboard/, short/, admin/
│  │     ├─ components/          design system primitives
│  │     ├─ features/            supply, borrow, repay, withdraw, short, history
│  │     ├─ hooks/
│  │     └─ styles/              tokens.css
│  └─ backend/                   Single Node service
│     └─ src/
│        ├─ keeper/              borrower tracking, HF checks, liquidation
│        ├─ scenarios/           price stepping, Pyth seed
│        ├─ indexer/             event history, LayerZero status
│        ├─ api/                 Hono routes (admin auth, history, scenarios)
│        ├─ chains/              viem clients per chain
│        ├─ db/                  Drizzle schema, SQLite
│        └─ index.ts
├─ packages/
│  ├─ shared/                    generated ABIs, deployments/{base,arbitrum}-sepolia.json,
│  │                             asset config (NVDA live, others placeholder), HF math, types
│  └─ tsconfig/                  shared TS configs
├─ scripts/                      TS CLIs: demo-reset, scenario (miss|beat|weekend|reset),
│                                fund-wallets, sync-allowlist
├─ deploy/                       docker-compose.yml, Caddyfile, backend Dockerfile
├─ ARCHITECTURE.md
├─ CLAUDE.md
└─ .env.example
```

### Backend modules

`apps/backend`, one Node process. `MODULES=prices,keeper,indexer` picks what runs.

- **prices:** heartbeat re-pushes the NVDA price once it is 20 min old (the hub treats 6 h as stale). Scenarios step the oracle over 15 s in 8 updates, relative to an anchor of $150: miss -20% ($120), beat +25% ($187.50), weekend gap -12% in one update ($132), reset. `target` moves gradually to an exact price; the demo's Scenario B uses `target 190` because +25% stops just short of Budi's ~$188 liquidation. Pyth anchoring is optional and needs `HERMES_API_KEY` (the public Hermes endpoint now answers 401).
- **keeper:** every account that ever borrowed (from indexed `Borrow` events) is checked with one multicall per tick. Below HF 1 with fresh prices it repays the largest debt against the largest collateral, buying NVDA on the exchange first when covering a short. Positions under HF 1.2 are listed as at risk.
- **indexer:** polls pool, short module and rewards module logs into SQLite and records each `CrossChainDelivery`. A tracker polls LayerZero Scan (`/messages/tx/{hash}`) and moves deliveries through sent, verified, delivered or failed. The log range per call adapts to the RPC's cap.
- **api (Hono):** `GET /api/health`, `/api/price`, `/api/scenarios`, `/api/history/:address`, `/api/activity`, `/api/keeper`; admin `POST /api/admin/scenario` (`{scenario}` or `{target}`), `/api/admin/price`, `/api/admin/anchor`. Admin calls carry an EIP-191 signature by the deployer over method, path, timestamp and body (`adminMessage` in `@muara/shared`), valid 5 min and once. The session override is an owner call on the risk engine, so the admin panel sends it straight from the deployer wallet.
- **admin CLI:** `pnpm --filter @muara/backend admin scenario miss|beat|weekendGap|reset`, `admin target 190`, `admin price 150`, `admin status`.
- **Nonces:** backend wallets use viem's local nonce manager. Alchemy's load-balanced RPC briefly reported stale nonces right after confirmations ("replacement transaction underpriced"). Keeper approvals run on the first tick, so an RPC failure retries instead of stopping the server.
- **Gas:** every backend write uses the estimate plus 30%. On a fork, exact estimates ran out of gas for both `openShort` and `setPrice`; the frontend should apply the same buffer to pool and module calls.
- **Verified:** unit tests (admin auth, scenario math, event mapping, LayerZero status, RPC range parsing) and an end to end run on a Base Sepolia fork: Rina's borrow to Arbitrum indexed with its delivery, Budi's short, `target 190` drained his HF to 0.989, the keeper liquidated (25 NVDA repaid, 4,987.5 USDC seized), `reset` returned to $150.

### Deploy runbook

Foundry scripts write addresses to `packages/shared/deployments/<chain>.json`. Run from `contracts/` with `contracts/.env` filled in (see `.env.example`):

1. `pnpm deploy:tokens:base` and `pnpm deploy:tokens:arb`: Allowlist, MockUSDC, NVDA on each chain.
2. `pnpm wire:base` and `pnpm wire:arb`: OFT peers and enforced receive gas.
3. `pnpm allowlist:base` and `pnpm allowlist:arb`: demo wallets on both allowlists.
4. `pnpm deploy:hub`: oracle, risk engine, rate model, pool (linked libraries), exchange, short and rewards modules, lens; configured from `DemoConfig`.
5. `pnpm seed`: exchange liquidity, USDC LP, wallet funding, Rina's early NVDA position and a background short so her rewards are ready. Run at least a day before judging (about $13 of rewards per day at the demo rates).
6. Full reset between rehearsals: `pnpm redeploy:hub` (fresh hub plus seed; tokens and peers untouched). Within one demo, reset is just the price back to $150.

The sequence was rehearsed end to end on local forks of both testnets, including a real LayerZero fee quote, Rina's borrow to Arbitrum, a USDC reward claim and Budi's full short cycle.

### Scripts

- Scenarios: the backend admin CLI above.
- Full reset: `pnpm --filter @muara/contracts redeploy:hub`, then restart the backend so it indexes from the new deploy block.

### Hosting (VPS)

Docker Compose with three services: `caddy` (TLS for the domain, serves `apps/web` static build, proxies `/api` to backend), `backend`, and a SQLite volume. Deploy by building on the VPS from the repo.

## 5. Libraries

Exact versions are pinned in the lockfile at scaffold time.

| Part | Choice | Reason |
|---|---|---|
| Contracts | Solidity 0.8.28 | Satisfies LayerZero's ^0.8.20 pragma and is stable on both chains |
| | Foundry 1.7 | Fast tests, fuzz and invariant testing, Solidity deploy scripts |
| | OpenZeppelin Contracts 5.6 | Required by LZ OFT; Ownable, SafeERC20, Math, transient reentrancy guard |
| | @layerzerolabs/oft-evm 4.0, oapp-evm 0.4, lz-evm-protocol-v2 3.0, test-devtools-evm-foundry 8.0 | Official OFT plus a local two-chain test harness |
| | @pythnetwork/pyth-sdk-solidity | Interface for the mainnet oracle adapter only |
| All TS | Node 24 LTS, TypeScript 5.9, pnpm 10, Turborepo 2 | One toolchain, cached builds across packages |
| | viem 2.x | Typed contract calls shared by web, backend and scripts |
| | @wagmi/cli 2.x | Generates typed ABIs from Foundry artifacts into `shared` |
| | zod 4 | Validates env and request bodies |
| Backend | Hono 4 + @hono/node-server | Small typed HTTP API |
| | Drizzle ORM (sqlite-proxy) on Node's built-in `node:sqlite` | Zero-ops history store with no native build (better-sqlite3 needed a Python toolchain on Windows) |
| | pino | Structured keeper logs |
| | Hermes REST via fetch | Optional real starting price; hermes-client 3.1 broke under ESM (old axios) |
| | tsup, tsx | Bundled build for Docker, TypeScript dev runner |
| Frontend | React 19 + Vite 8 | Fast dev loop, no SSR needed |
| | wagmi 2.19 + TanStack Query 5 | Wallet state and cached chain reads; wagmi 3 is out but RainbowKit 2 still requires wagmi 2 |
| | RainbowKit 2 | Polished connect flow and chain switching |
| | TanStack Router | Typed routes for Markets, Dashboard, Short, Admin |
| | Tailwind CSS 4 | CSS variable tokens map directly to the design system |
| | Radix UI primitives | Accessible modals, tabs, tooltips styled our way |
| | lightweight-charts 5 | Live price and P&L charts |
| Test | Vitest 5 | Backend tests |
| Hosting | Docker Compose + Caddy 2 | One command deploy, automatic HTTPS on the VPS domain |

## 6. Frontend information architecture

Aave-style flows with Muara's own identity.

- **Markets:** table of assets with total supplied, total borrowed, utilization, supply APY, borrow APY, market status badge. Placeholder tickers render as "coming soon" rows.
- **Dashboard:** net worth, net APY, prominent health factor; four panels: Your collateral, Your borrows, Assets to supply, Assets to borrow. Sharia toggle on supplied stock.
- **Action modals:** supply, borrow, repay, withdraw, each with a live preview of the new health factor. Borrow and withdraw include the destination chain selector and the LayerZero fee quote.
- **Short:** Open short and Close short with live P&L and price chart.
- **History:** transactions with LayerZero delivery status.
- **Admin:** scenario panel and market-hours override, visible only to the admin wallet.
- **Global:** fixed "Simulation mode" badge; market-hours badge per stock (open, closed, weekend, paused).


### Frontend implementation notes

- `apps/web`: routes Markets (`/`), Dashboard, Short, History, Admin (shown only to the pool owner, which is the backend admin).
- Every write goes through `useTx`: switch to Base, simulate with `errorsAbi` merged in (library reverts decode to plain messages), estimate gas plus 30%, send, wait, toast with a BaseScan link, refresh all reads. Approvals are requested only when the allowance is short.
- Health factor previews in modals and the short form are computed client side from the Lens user view (`features/account/math.ts`, mirroring `HealthLogic`), so they update per keystroke; the Lens `previewAction` remains available. Liquidation prices come from bisecting that model on the stock price.
- Cross-chain withdraw, borrow and USDC reward claims quote `quoteDelivery` and send the fee plus 5%; LayerZero refunds the excess.
- Admin actions sign `adminMessage` with the connected deployer wallet; the session override is a direct risk engine transaction.
- The price chart plots oracle prices polled from `/api/price` since page load (no stored price history).
- Dev: `pnpm --filter @muara/web dev` with the backend on :8787 (Vite proxies `/api`). Config in `apps/web/.env.example`.
## 7. Design language: Estuary

Concept: tributaries (chains, assets, users) converge into one calm, deep channel (the registry). Dark first, with a light mode.

### Color tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | #0B1418 | #F4F7F6 | Page background, deep water |
| `surface` | #111E24 | #FFFFFF | Cards, tables |
| `surface-raised` | #172A31 | #EEF3F2 | Modals, hover rows |
| `border` | #23383F | #D6E0DE | Hairlines |
| `text` | #E8F1EF | #0F1F24 | Primary text |
| `text-2` | #9DB3B0 | #46605D | Secondary text |
| `text-3` | #6B8380 | #7A8F8C | Muted text |
| `brand` (river teal) | #2FB8A6 | #128C7E | Primary actions, long side |
| `tide` (indigo) | #7C83F2 | #4F56D1 | Short side |
| `silt` (gold) | #D9A441 | #A87414 | Yield, fees, simulation badge |
| `pos` | #3FBF7F | #1E8E57 | Positive P&L only |
| `neg` | #E5484D | #C8262C | Negative P&L only |
| `hf-safe` (≥ 2) | #3FBF7F | #1E8E57 | Health factor |
| `hf-watch` (1.5 to 2) | #D9A441 | #A87414 | Health factor |
| `hf-danger` (1.1 to 1.5) | #F08A3C | #C2620F | Health factor |
| `hf-critical` (< 1.1) | #E5484D | #C8262C | Health factor |

Long and short are teal and indigo, never green and red, so P&L colors stay unambiguous.

### Typography

- Geist for UI text.
- Geist Mono for every number, with tabular figures.
- Instrument Serif for page titles and the tagline only.
- Scale: 12, 13, 14, 16, 20, 24, 32, 44 px.

### Spacing and shape

- 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 6 inputs, 10 cards, 16 modals, full for badges.
- Depth from borders, not shadows. Max content width 1240 px.

### Motif

Restrained: tables stay clean, the motif lives in identity and state visuals.

- Logo mark: thin lines converging into one wide channel.
- Header band: faint animated bathymetric contour lines.
- Health factor: water-level gauge with a flood line at 1.0; it visibly drains in Scenario B.
- LayerZero status: Base to Arbitrum flow path, animated dashes in transit, stages Sent, Verified, Delivered.
- Chain selector: two tributaries feeding one mouth.
- Utilization bars: slow current gradient.
- Collateral that works: gold particles flow from shorts back to the holder's collateral as fees accrue.
- Motion: 8 to 12 s loops, disabled under `prefers-reduced-motion`.

## 8. Demo flow mapping

| Step | Contracts and services involved |
|---|---|
| Rina deposits 100 NVDA, borrows 10,000 USDC to Arbitrum | `MuaraPool.supply`, `MuaraPool.borrow(dstEid = 40231)`, `MockUSDC` OFT send |
| Budi deposits 15,000 USDC, opens short 50 NVDA at $150 | `ShortModule.openShort`, `MockExchange` |
| Scenario A: price to $120, close short, withdraw profit to Arbitrum | backend scenarios, `ShortModule.closeShort`, `MuaraPool.withdraw(dstEid)` |
| Scenario B: price to $190, margin call, liquidation, withdrawal blocked | backend scenarios, keeper `liquidate`, HF check revert in `withdraw` |
| Proof | LayerZero Scan, BaseScan and Arbiscan links from history |
