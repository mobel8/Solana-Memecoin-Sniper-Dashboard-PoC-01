import type { DexPair, RiskScore, RiskFlag } from './types'

/**
 * Port exact de compute_risk_score() du backend Rust.
 * Même algorithme, mêmes seuils, mêmes flags.
 */
export function computeRiskScore(pair: DexPair): RiskScore {
  let score = 50
  const flags: RiskFlag[] = []

  // 1. Liquidity
  const liq = pair.liquidity?.usd ?? 0
  if (liq > 10_000) {
    score += 15
    flags.push({ name: 'Liquidity', severity: 'info', description: `Liquidity $${Math.round(liq)} — sufficient for trading`, passed: true })
  } else if (liq > 1_000) {
    score += 5
    flags.push({ name: 'Liquidity', severity: 'warning', description: `Liquidity $${Math.round(liq)} — low, high slippage risk`, passed: false })
  } else {
    score -= 20
    flags.push({ name: 'Liquidity', severity: 'danger', description: `Liquidity $${Math.round(liq)} — critical, possible honeypot`, passed: false })
  }

  // 2. Volume 1h
  const volH1 = pair.volume?.h1 ?? 0
  if (volH1 > 5_000) {
    score += 10
    flags.push({ name: 'Volume', severity: 'info', description: `Vol 1h $${Math.round(volH1)} — active trading`, passed: true })
  } else if (volH1 > 0) {
    flags.push({ name: 'Volume', severity: 'warning', description: `Vol 1h $${Math.round(volH1)} — low activity`, passed: false })
  } else {
    score -= 15
    flags.push({ name: 'Volume', severity: 'danger', description: 'No trading volume — possible honeypot', passed: false })
  }

  // 3. Buy/Sell ratio
  const buys = pair.txns?.h1?.buys ?? 0
  const sells = pair.txns?.h1?.sells ?? 0
  const totalTxns = buys + sells

  if (totalTxns > 50) {
    score += 10
    const ratio = totalTxns > 0 ? buys / totalTxns : 0.5
    flags.push({ name: 'Txn Activity', severity: 'info', description: `${totalTxns} txns 1h, buy ratio ${Math.round(ratio * 100)}%`, passed: true })
  } else if (sells === 0 && buys > 5) {
    score -= 25
    flags.push({ name: 'Sell Block', severity: 'danger', description: "No sells detected — possible honeypot (can't sell)", passed: false })
  }

  // 4. Pool age
  const ageMs = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0
  const ageHours = Math.floor(ageMs / (3600 * 1000))

  if (ageHours < 1) {
    score -= 10
    flags.push({ name: 'Pool Age', severity: 'warning', description: 'Pool < 1h old — very new, higher risk', passed: false })
  } else if (ageHours > 6) {
    score += 10
    flags.push({ name: 'Pool Age', severity: 'info', description: `Pool ${ageHours}h old — survived initial period`, passed: true })
  }

  // 5. FDV check
  const fdv = pair.fdv ?? 0
  if (fdv > 100_000_000) {
    score -= 15
    flags.push({ name: 'FDV', severity: 'danger', description: `FDV $${Math.round(fdv / 1_000_000)}M — unrealistically high`, passed: false })
  }

  // Clamp
  score = Math.max(0, Math.min(100, score))

  const level =
    score >= 80 ? 'SAFE' :
    score >= 60 ? 'CAUTION' :
    score >= 30 ? 'DANGER' :
    'CRITICAL'

  return { score, level, flags }
}
