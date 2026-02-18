import type { DexSearchResponse, DexPair, Opportunity } from './types'
import { computeRiskScore } from './riskScore'

const QUERIES = ['pump', 'moon', 'sol', 'doge', 'pepe', 'inu', 'cat', 'meme']
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PER_CYCLE = 5

let queryIdx = 0

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function pairToOpportunity(p: DexPair): Opportunity {
  return {
    id: uid(),
    token_name: p.baseToken.name,
    token_symbol: p.baseToken.symbol,
    token_address: p.baseToken.address,
    pair_address: p.pairAddress,
    dex_id: p.dexId,
    price_usd: p.priceUsd ? parseFloat(p.priceUsd) || 0 : 0,
    liquidity_usd: p.liquidity?.usd ?? 0,
    volume_h24: p.volume?.h24 ?? 0,
    volume_h6: p.volume?.h6 ?? 0,
    volume_h1: p.volume?.h1 ?? 0,
    price_change_m5: p.priceChange?.m5 ?? 0,
    price_change_h1: p.priceChange?.h1 ?? 0,
    price_change_h6: p.priceChange?.h6 ?? 0,
    price_change_h24: p.priceChange?.h24 ?? 0,
    market_cap: p.marketCap ?? 0,
    fdv: p.fdv ?? 0,
    txns_h1_buys: p.txns?.h1?.buys ?? 0,
    txns_h1_sells: p.txns?.h1?.sells ?? 0,
    txns_h24_buys: p.txns?.h24?.buys ?? 0,
    txns_h24_sells: p.txns?.h24?.sells ?? 0,
    pair_created_at: p.pairCreatedAt ?? 0,
    detected_at: new Date().toLocaleTimeString('fr-FR', { hour12: false }),
    status: 'DETECTED',
    risk_score: computeRiskScore(p),
  }
}

export interface FetchResult {
  newOpportunities: Opportunity[]
  query: string
  error?: string
}

/**
 * Fetch new opportunities from DexScreener via the Vercel proxy.
 * Rotates through search queries automatically.
 */
export async function fetchNewOpportunities(seenPairs: Set<string>): Promise<FetchResult> {
  const query = QUERIES[queryIdx % QUERIES.length]
  queryIdx++

  try {
    const res = await fetch(`/api/dexscreener?q=${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const body: DexSearchResponse = await res.json()
    const pairs = body.pairs ?? []
    const nowMs = Date.now()

    const filtered: DexPair[] = []
    for (const p of pairs) {
      if (filtered.length >= MAX_PER_CYCLE) break
      if (p.chainId !== 'solana') continue
      if (seenPairs.has(p.pairAddress)) continue
      if (!p.pairCreatedAt || nowMs - p.pairCreatedAt >= DAY_MS) continue
      if ((p.liquidity?.usd ?? 0) <= 500) continue
      filtered.push(p)
    }

    const newOpps = filtered.map(p => {
      seenPairs.add(p.pairAddress)
      return pairToOpportunity(p)
    })

    // Prune seen cache
    if (seenPairs.size > 2_000) seenPairs.clear()

    return { newOpportunities: newOpps, query }
  } catch (e) {
    return { newOpportunities: [], query, error: String(e) }
  }
}
