interface HermesFeed {
  id: string;
  attributes?: { symbol?: string };
}

interface HermesLatest {
  parsed?: { price: { price: string; expo: number } }[];
}

/**
 * Latest Pyth price for a US equity as WAD USD, straight from the Hermes REST API (which now
 * requires an API key). Used to optionally anchor the demo on a real quote before scenario
 * offsets are applied.
 */
export async function fetchPythEquityPrice(hermesUrl: string, symbol: string, apiKey?: string): Promise<bigint> {
  const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const wanted = `Equity.US.${symbol}/USD`;
  const feeds = await getJson<HermesFeed[]>(
    `${hermesUrl}/v2/price_feeds?query=${encodeURIComponent(symbol)}&asset_type=equity`,
    headers,
  );
  const feed = feeds.find((f) => f.attributes?.symbol === wanted);
  if (!feed) throw new Error(`Pyth feed ${wanted} not found`);

  const latest = await getJson<HermesLatest>(
    `${hermesUrl}/v2/updates/price/latest?ids[]=${feed.id}&parsed=true`,
    headers,
  );
  const price = latest.parsed?.[0]?.price;
  if (!price) throw new Error(`Pyth returned no price for ${wanted}`);

  const shift = 18 + price.expo;
  const raw = BigInt(price.price);
  return shift >= 0 ? raw * 10n ** BigInt(shift) : raw / 10n ** BigInt(-shift);
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (res.status === 401) throw new Error("Hermes requires an API key: set HERMES_API_KEY");
  if (!res.ok) throw new Error(`Hermes ${res.status} for ${url}`);
  return (await res.json()) as T;
}
