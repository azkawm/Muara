import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatEther, parseUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { PageTitle } from "../app/layout";
import { AssetIcon } from "../components/Market";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, CardHeader, EmptyState, Row, Skeleton } from "../components/ui";
import { API_URL } from "../lib/api";
import { contracts, HUB_CHAIN_ID, NVDA, USDC } from "../lib/contracts";
import { formatToken } from "../lib/format";
import { useWalletBalance } from "../lib/hooks";
import { useTx } from "../lib/useTx";

interface FaucetStatus {
  funder: string;
  gasEth: string;
  nextClaimAt: number;
  allowlisted: boolean;
}

interface FaucetResult {
  allowlisted: { base: string; arbitrum: string };
  gas: { base: string; arbitrum: string };
  nextClaimAt: number;
}

const USDC_AMOUNT = parseUnits("10000", USDC.decimals);
const NVDA_AMOUNT = parseUnits("100", NVDA.decimals);

export function FaucetPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { send, busy, pending } = useTx();
  const [result, setResult] = useState<FaucetResult>();

  const status = useQuery({
    queryKey: ["faucet", address],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/faucet/${address}`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as FaucetStatus;
    },
    enabled: !!address,
    refetchInterval: 10_000,
  });
  const { data: eth } = useBalance({ address, chainId: HUB_CHAIN_ID, query: { enabled: !!address, refetchInterval: 6_000 } });
  const { data: usdcBal } = useWalletBalance(USDC);
  const { data: nvdaBal } = useWalletBalance(NVDA);

  const prepare = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = (await res.json()) as FaucetResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Faucet failed (${res.status})`);
      return json;
    },
    onSuccess: (r) => {
      setResult(r);
      toast.push({ title: "Wallet prepared", description: "Allowlisted on Base and Arbitrum, gas topped up.", tone: "success" });
      void queryClient.invalidateQueries();
    },
    onError: (err) => toast.push({ title: "Faucet", description: err.message, tone: "error" }),
  });

  const mintUsdc = () => send("Mint 10,000 USDC", { ...contracts.usdc, functionName: "faucet", args: [USDC_AMOUNT] }).catch(() => {});
  const mintNvda = () => send("Mint 100 NVDA", { ...contracts.nvda, functionName: "faucet", args: [NVDA_AMOUNT] }).catch(() => {});

  const cooldown = status.data && status.data.nextClaimAt > Date.now();
  const ready = status.data?.allowlisted && (eth?.value ?? 0n) > 0n;

  return (
    <>
      <PageTitle title="Faucet" sub="Test assets for Base Sepolia. Three steps and you can run the whole flow: lend, borrow to Arbitrum, short." />
      {!isConnected ? (
        <Card>
          <EmptyState title="Connect a wallet to get test assets.">
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="1. Prepare your wallet"
                sub="Puts your address on the stock token allowlist on both chains and sends a little ETH for gas, from the deployer."
                aside={ready ? <Badge tone="pos" dot>Ready</Badge> : <Badge tone="silt">Needed once</Badge>}
              />
              <div className="space-y-4 px-5 py-5">
                <Row label="Allowlisted (Base)">{status.isLoading ? <Skeleton /> : status.data?.allowlisted ? "Yes" : "No"}</Row>
                <Row label="Base Sepolia ETH">{eth ? `${Number(formatEther(eth.value)).toFixed(4)} ETH` : <Skeleton />}</Row>
                <Button
                  variant="glass"
                  size="lg"
                  className="w-full"
                  loading={prepare.isPending}
                  disabled={!!cooldown || status.isLoading}
                  onClick={() => prepare.mutate()}
                >
                  {cooldown ? `Used · again ${new Date(status.data!.nextClaimAt).toLocaleTimeString()}` : "Prepare my wallet"}
                </Button>
                {result && (
                  <div className="space-y-1 text-small text-ink-3">
                    <div>Base allowlist: {result.allowlisted.base === "already" ? "already on it" : "done"} · Arbitrum allowlist: {result.allowlisted.arbitrum === "already" ? "already on it" : "done"}</div>
                    <div>Gas: Base {result.gas.base === "enough" ? "already funded" : "sent"} · Arbitrum {result.gas.arbitrum === "enough" ? "already funded" : "sent"}</div>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="2. Mint test tokens" sub="Minted by your own wallet from the token faucets (that is why step 1 needs gas and the allowlist)." />
              <div className="divide-y divide-line">
                {[
                  { asset: USDC, amount: "10,000", balance: usdcBal, onClick: mintUsdc, label: "Mint 10,000 USDC", note: "Short collateral, repayments, supply." },
                  { asset: NVDA, amount: "100", balance: nvdaBal, onClick: mintNvda, label: "Mint 100 NVDA", note: "Lend it out and borrow USDC against it. Needs the allowlist." },
                ].map((m) => (
                  <div key={m.asset.symbol} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <AssetIcon symbol={m.asset.symbol} kind={m.asset.kind} />
                    <div className="min-w-40">
                      <div className="text-body text-ink">{m.asset.symbol}</div>
                      <div className="text-small text-ink-3">{m.note}</div>
                    </div>
                    <div className="num ml-auto text-small text-ink-2">
                      {formatToken(m.balance ?? 0n, m.asset.decimals, 2)} {m.asset.symbol} in wallet
                    </div>
                    <Button variant="secondary" disabled={!ready || busy} loading={busy && pending === m.label} onClick={m.onClick}>
                      {m.label}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="self-start">
            <CardHeader title="3. Run the flow" />
            <ol className="space-y-3 px-5 py-5 text-body text-ink-2">
              <li><span className="text-ink">Lend:</span> Dashboard → supply NVDA, borrow USDC, pick Arbitrum as the destination.</li>
              <li><span className="text-ink">Earn:</span> your NVDA is lent to shorts; claim the fee in USDC from "Collateral that works".</li>
              <li><span className="text-ink">Short:</span> Short tab → post USDC, open a 10 NVDA short, watch P&L as the admin moves the price.</li>
              <li><span className="text-ink">Close:</span> close the short and withdraw your USDC to Base or Arbitrum.</li>
            </ol>
            <div className="border-t border-line px-5 py-4 text-small text-ink-3">
              Testnet only. Gas comes from the deployer wallet, once per address per day; tokens are mock assets with no value.
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
