import { ADMIN_HEADERS, adminMessage, type DeliveryStatus, type ScenarioDef } from "@muara/shared";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export interface PriceState {
  asset: string;
  price: string;
  updatedAt: number;
  ageSeconds: number;
  anchor: string;
  scenario: {
    id: string;
    status: "running" | "done" | "failed";
    from: string;
    to: string;
    step: number;
    steps: number;
    startedAt: number;
    finishedAt: number | null;
    error: string | null;
    txHashes: string[];
  } | null;
}

export interface HistoryAction {
  name: string;
  source: string;
  account: string | null;
  asset: string | null;
  amount: string | null;
  dstEid: number | null;
  args: Record<string, string | number | boolean>;
}

export interface HistoryDelivery {
  guid: string;
  asset: string;
  recipient: string;
  amount: string;
  dstEid: number;
  status: DeliveryStatus;
  dstTxHash: string | null;
  lzScanUrl: string;
}

export interface HistoryEntry {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  actions: HistoryAction[];
  deliveries: HistoryDelivery[];
}

export interface KeeperState {
  address: string;
  tracked: number;
  atRisk: { user: string; healthFactor: string; debtValue: string; collateralValue: string; pricesFresh: boolean }[];
  recent: {
    at: number;
    user: string;
    status: "liquidated" | "failed";
    debtRepaid?: string;
    collateralSeized?: string;
    debtAsset?: string;
    collateralAsset?: string;
    txHash?: string;
    reason?: string;
  }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  price: () => get<PriceState>("/price"),
  scenarios: () => get<{ scenarios: ScenarioDef[] }>("/scenarios"),
  history: (address: string) => get<{ entries: HistoryEntry[] }>(`/history/${address}`),
  activity: () => get<{ entries: HistoryEntry[] }>("/activity"),
  keeper: () => get<KeeperState>("/keeper"),
};

/**
 * POST to an admin route with a fresh signature from the connected admin wallet. The path
 * signed is the backend path (/api/...), which is what the server rebuilds.
 */
export async function adminPost(
  route: string,
  payload: unknown,
  account: `0x${string}`,
  signMessage: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<unknown> {
  const body = JSON.stringify(payload);
  const timestamp = Date.now();
  const path = `/api/admin${route}`;
  const signature = await signMessage({ message: adminMessage({ method: "POST", path, timestamp, body }) });
  const res = await fetch(`${API_URL}/admin${route}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      [ADMIN_HEADERS.address]: account,
      [ADMIN_HEADERS.timestamp]: String(timestamp),
      [ADMIN_HEADERS.signature]: signature,
    },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Admin request failed (${res.status})`);
  return json;
}
