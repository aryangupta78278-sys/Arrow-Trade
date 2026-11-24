const ALLOWED_SYMBOLS = ["EUR/USD", "GBP/USD", "XAU/USD"];
const CACHE_SECONDS = 30;

// Best-effort cache for warm Vercel serverless instances
let cachedData = null;
let cacheTime = 0;

export default async function handler(req, res) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "TWELVE_DATA_API_KEY not configured"
    });
  }

  const requested = req.query.symbols || req.query.symbol;

  let symbols = requested
    ? String(requested).split(",").map(s => s.trim().toUpperCase())
    : ALLOWED_SYMBOLS;

  symbols = [...new Set(symbols)];

  if (!symbols.length || symbols.some(s => !ALLOWED_SYMBOLS.includes(s))) {
    return res.status(400).json({
      error: "Allowed symbols: EUR/USD, GBP/USD, XAU/USD"
    });
  }

  const isSingle = symbols.length === 1;

  // Reuse cached data when available
  const cacheValid =
    cachedData &&
    Date.now() - cacheTime < CACHE_SECONDS * 1000 &&
    symbols.every(s => cachedData[s]);

  if (cacheValid) {
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=15");

    if (isSingle) {
      return res.status(200).json({
        symbol: symbols[0],
        price: cachedData[symbols[0]].price,
        source: "Twelve Data",
        cached: true
      });
    }

    return res.status(200).json({
      prices: Object.fromEntries(
        symbols.map(s => [s, cachedData[s]])
      ),
      source: "Twelve Data",
      cached: true
    });
  }

  try {
    const url =
      "https://api.twelvedata.com/price?symbol=" +
      encodeURIComponent(symbols.join(",")) +
      "&apikey=" + encodeURIComponent(apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      return res.status(502).json({
        error: data.message || "Twelve Data request failed",
        details: data
      });
    }

    const result = {};

    for (const symbol of symbols) {
      const item = symbols.length === 1 ? data : data[symbol];
      const price = Number(item?.price);

      if (!Number.isFinite(price) || price <= 0) {
        result[symbol] = {
          error: item?.message || "Price unavailable"
        };
      } else {
        result[symbol] = {
          price,
          updatedAt: new Date().toISOString()
        };
      }
    }

    cachedData = {
      ...(cachedData || {}),
      ...result
    };
    cacheTime = Date.now();

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=15"
    );

    if (isSingle) {
      if (result[symbols[0]].error) {
        return res.status(502).json(result[symbols[0]]);
      }

      return res.status(200).json({
        symbol: symbols[0],
        price: result[symbols[0]].price,
        source: "Twelve Data",
        cached: false
      });
    }

    return res.status(200).json({
      prices: result,
      source: "Twelve Data",
      cached: false
    });

  } catch (error) {
    return res.status(500).json({
      error: "Market data fetch failed"
    });
  }
}
