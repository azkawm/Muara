import { CHAINS, DEPLOYMENTS } from "@muara/shared";
import { shortAddress } from "../lib/format";

/** Every deployed contract per chain, linked to its verified source on the explorer. */
export function DeploymentsFooter() {
  const base = DEPLOYMENTS.baseSepolia;
  const arb = DEPLOYMENTS.arbitrumSepolia;
  const groups = [
    {
      chain: CHAINS.baseSepolia,
      logo: "/logos/base.png",
      note: "Hub: loan book, risk engine, modules and tokens",
      contracts: [
        ["MuaraPool", base.hub.pool],
        ["RiskEngine", base.hub.riskEngine],
        ["InterestRateModel", base.hub.rateModel],
        ["ShortModule", base.hub.shortModule],
        ["RewardsModule", base.hub.rewardsModule],
        ["MuaraLens", base.hub.lens],
        ["MockPriceOracle", base.hub.oracle],
        ["MockExchange", base.hub.exchange],
        ["USDC (OFT)", base.tokens.usdc],
        ["NVDA (OFT)", base.tokens.nvda],
        ["Allowlist", base.tokens.allowlist],
      ],
    },
    {
      chain: CHAINS.arbitrumSepolia,
      logo: "/logos/arbitrum.png",
      note: "Delivery chain: OFT tokens peered to Base over LayerZero",
      contracts: [
        ["USDC (OFT)", arb.tokens.usdc],
        ["NVDA (OFT)", arb.tokens.nvda],
        ["Allowlist", arb.tokens.allowlist],
      ],
    },
  ] as const;

  return (
    <section className="border-t border-line py-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-h4 font-semibold tracking-tight text-ink">Deployed contracts</h2>
        <span className="text-small text-ink-3">Verified source on each explorer · Non-upgradeable</span>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.chain.key} className="rounded-card border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <img src={g.logo} alt="" className="size-6 rounded-full" draggable={false} />
              <div>
                <div className="text-body font-medium text-ink">
                  {g.chain.name} <span className="num text-small text-ink-3">· chain {g.chain.chainId} · eid {g.chain.eid}</span>
                </div>
                <div className="text-small text-ink-3">{g.note}</div>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {g.contracts.map(([name, address]) => (
                <li key={name} className="flex items-center justify-between gap-4 px-5 py-2.5 text-small">
                  <span className="text-ink-2">{name}</span>
                  <a
                    href={`${g.chain.explorer}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="num text-ink hover:text-brand"
                    title={address}
                  >
                    {shortAddress(address)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
