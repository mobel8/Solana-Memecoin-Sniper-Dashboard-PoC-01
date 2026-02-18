import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query.q
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "q"' })
  }

  try {
    const upstream = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'SniperBot/1.0 (PoC)' } },
    )
    const data = await upstream.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(502).json({ error: 'Failed to fetch DexScreener', detail: String(e) })
  }
}
