/**
 * Every backend write gets 30% gas headroom. On a Base Sepolia fork, exact estimates ran out
 * of gas on execution for both openShort and setPrice; the buffer costs next to nothing on
 * testnet and removes that failure mode.
 */
export const withGasBuffer = (estimate: bigint): bigint => (estimate * 130n) / 100n;
