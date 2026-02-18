// ════════════════════════════════════════════════════════════════
//  Types partagés (miroir de l'ancien modèle Rust)
// ════════════════════════════════════════════════════════════════

export interface Opportunity {
  id: string
  token_name: string
  token_symbol: string
  token_address: string
  pair_address: string
  dex_id: string
  price_usd: number
  liquidity_usd: number
  volume_h24: number
  volume_h6: number
  volume_h1: number
  price_change_m5: number
  price_change_h1: number
  price_change_h6: number
  price_change_h24: number
  market_cap: number
  fdv: number
  txns_h1_buys: number
  txns_h1_sells: number
  txns_h24_buys: number
  txns_h24_sells: number
  pair_created_at: number
  detected_at: string
  status: 'DETECTED' | 'SNIPED' | 'MISSED'
  risk_score: RiskScore | null
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
  message: string
}

export interface JitoConfig {
  tip_min_sol: number
  tip_max_sol: number
  block_engine: string
  tip_strategy: string
  max_txns_per_bundle: number
  slippage_bps: number
  anti_sandwich: boolean
  compute_unit_limit: number
  priority_fee_micro_lamports: number
}

export interface NetworkStats {
  tps: number
  current_slot: number
  epoch: number
  priority_fee_estimate: number
  congestion_level: string
  active_validators: number
  sol_price_usd: number
  last_updated: string
}

export interface RiskFlag {
  name: string
  severity: string
  description: string
  passed: boolean
}

export interface RiskScore {
  score: number
  level: string
  flags: RiskFlag[]
}

export interface SnipeHistoryEntry {
  id: string
  timestamp: string
  token_symbol: string
  token_address: string
  action: string
  amount_sol: number
  price_usd: number
  tip_sol: number
  bundle_id: string
  block_engine: string
  landing_slot: number
  status: string
  pnl_pct: number
  simulation: boolean
}

// ════════════════════════════════════════════════════════════════
//  Types DexScreener API
// ════════════════════════════════════════════════════════════════

export interface DexSearchResponse {
  pairs: DexPair[] | null
}

export interface DexPair {
  chainId: string
  dexId: string
  pairAddress: string
  baseToken: { address: string; name: string; symbol: string }
  priceUsd: string | null
  liquidity: { usd: number | null } | null
  volume: { h24: number | null; h6: number | null; h1: number | null } | null
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null } | null
  txns: {
    h1: { buys: number | null; sells: number | null } | null
    h24: { buys: number | null; sells: number | null } | null
  } | null
  marketCap: number | null
  fdv: number | null
  pairCreatedAt: number | null
}

// ════════════════════════════════════════════════════════════════
//  Defaults
// ════════════════════════════════════════════════════════════════

export const DEFAULT_JITO_CONFIG: JitoConfig = {
  tip_min_sol: 0.0001,
  tip_max_sol: 0.005,
  block_engine: 'amsterdam',
  tip_strategy: 'dynamic',
  max_txns_per_bundle: 1,
  slippage_bps: 100,
  anti_sandwich: true,
  compute_unit_limit: 200_000,
  priority_fee_micro_lamports: 5_000,
}

export const DEFAULT_NETWORK_STATS: NetworkStats = {
  tps: 3200,
  current_slot: 290_000_000,
  epoch: 600,
  priority_fee_estimate: 5_000,
  congestion_level: 'medium',
  active_validators: 1_900,
  sol_price_usd: 140.0,
  last_updated: new Date().toLocaleTimeString('fr-FR', { hour12: false }),
}
