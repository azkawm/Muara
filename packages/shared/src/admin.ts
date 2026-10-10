/**
 * Admin requests are authorized by an EIP-191 signature from the admin wallet over this
 * message. The frontend signs it and the backend rebuilds it to verify, so both sides must
 * use this exact function.
 */
export interface AdminMessageInput {
  method: string;
  path: string;
  /** Milliseconds since epoch, also sent in the x-admin-timestamp header. */
  timestamp: number;
  /** Raw request body, empty string when there is none. */
  body: string;
}

export const ADMIN_HEADERS = {
  address: "x-admin-address",
  timestamp: "x-admin-timestamp",
  signature: "x-admin-signature",
} as const;

/** Signatures older than this are rejected. */
export const ADMIN_SIGNATURE_TTL_MS = 5 * 60 * 1000;

export function adminMessage({ method, path, timestamp, body }: AdminMessageInput): string {
  return ["Muara admin", `${method.toUpperCase()} ${path}`, String(timestamp), body].join("\n");
}
