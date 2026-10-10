import { formatUnits } from "viem";
import type { AssetMeta } from "../lib/contracts";
import { formatToken } from "../lib/format";
import { AssetIcon } from "./Market";

export function AmountInput({
  asset,
  value,
  onChange,
  max,
  maxLabel = "Balance",
  usdPrice,
  error,
  onMax,
}: {
  asset: AssetMeta;
  value: string;
  onChange: (v: string) => void;
  max?: bigint;
  maxLabel?: string;
  /** Asset price in USD, for the value hint. */
  usdPrice?: number;
  error?: string;
  /** Called after MAX fills the input, so callers can mean "everything at execution time". */
  onMax?: () => void;
}) {
  const usd = usdPrice !== undefined && value && Number(value) > 0 ? Number(value) * usdPrice : undefined;
  return (
    <div>
      <div className={`rounded-input border bg-bg/25 px-3 py-3 ${error ? "border-neg" : "border-line focus-within:border-brand"}`}>
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(",", "."))}
            className="num min-w-0 flex-1 bg-transparent text-h4 text-ink outline-none placeholder:text-ink-3"
            aria-label={`Amount of ${asset.symbol}`}
          />
          <span className="flex items-center gap-2">
            <AssetIcon symbol={asset.symbol} kind={asset.kind} size={24} />
            <span className="text-body font-medium text-ink">{asset.symbol}</span>
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-small text-ink-3">
          <span className="num">{usd !== undefined ? `≈ $${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : " "}</span>
          {max !== undefined && (
            <button
              type="button"
              className="num hover:text-brand"
              onClick={() => {
                onChange(formatUnits(max, asset.decimals));
                onMax?.();
              }}
            >
              {maxLabel} {formatToken(max, asset.decimals)} <span className="ml-1 font-medium text-brand">MAX</span>
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-small text-neg">{error}</p>}
    </div>
  );
}
