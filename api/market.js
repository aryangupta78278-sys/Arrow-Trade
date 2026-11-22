export default async function handler(req, res) {
  const symbol = req.query.symbol || "EUR/USD";

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "API key not configured"
    });
  }

  try {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      return res.status(400).json(data);
    }

    return res.status(200).json({
      symbol,
      price: data.price,
      source: "Twelve Data"
    });

  } catch (error) {
    return res.status(500).json({
      error: "Market data fetch failed"
    });
  }
}
