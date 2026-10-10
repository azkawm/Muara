/** Cross-chain delivery stages shown in the transaction history. */
export type DeliveryStatus = "sent" | "verified" | "delivered" | "failed";

/** Subset of a LayerZero Scan message we rely on. */
export interface LzScanMessage {
  guid?: string;
  status?: { name?: string; message?: string };
  verification?: Record<string, { status?: string } | undefined>;
  destination?: { status?: string; tx?: { txHash?: string } };
}

const FAILED = new Set(["FAILED", "BLOCKED", "PAYLOAD_STORED", "APPLICATION_BURNED", "UNRESOLVABLE_COMMAND"]);

/** Map a LayerZero Scan message to Muara's three visible stages plus failure. */
export function deliveryStatusFromScan(message: LzScanMessage | undefined): DeliveryStatus {
  const name = message?.status?.name?.toUpperCase();
  if (!name) return "sent";
  if (name === "DELIVERED") return "delivered";
  if (FAILED.has(name)) return "failed";
  const dvn = message?.verification?.dvn?.status?.toUpperCase();
  return dvn === "SUCCEEDED" ? "verified" : "sent";
}

export const LZ_SCAN_API_TESTNET = "https://scan-testnet.layerzero-api.com/v1";

export function lzScanTxUrl(txHash: string): string {
  return `https://testnet.layerzeroscan.com/tx/${txHash}`;
}
