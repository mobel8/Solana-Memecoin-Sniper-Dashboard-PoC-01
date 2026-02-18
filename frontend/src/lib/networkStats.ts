import type { NetworkStats } from './types'

/**
 * Simule la mise à jour des stats réseau Solana (même logique que le Rust).
 * Mute l'objet passé en paramètre et retourne une copie.
 */
export function simulateNetworkStats(prev: NetworkStats): NetworkStats {
  const now = Math.floor(Date.now() / 1000)

  // TPS varie entre 2000 et 5000
  const tpsDelta = ((now % 7) - 3) * 100
  const tps = Math.max(2000, Math.min(5000, prev.tps + tpsDelta))

  // Slot avance d'environ 75 par 30s
  const currentSlot = prev.current_slot + 75
  const epoch = Math.floor(currentSlot / 432_000)

  // Priority fee selon TPS
  const priorityFeeEstimate =
    tps <= 2500 ? 50_000 :
    tps <= 3500 ? 10_000 :
    tps <= 4500 ? 5_000 :
    1_000

  const congestionLevel =
    tps <= 2500 ? 'high' :
    tps <= 3500 ? 'medium' :
    'low'

  // Variation prix SOL
  const delta = ((now % 5) - 2) * 0.15
  const solPriceUsd = Math.max(130, Math.min(160, prev.sol_price_usd + delta))

  return {
    tps,
    current_slot: currentSlot,
    epoch,
    priority_fee_estimate: priorityFeeEstimate,
    congestion_level: congestionLevel,
    active_validators: prev.active_validators,
    sol_price_usd: Math.round(solPriceUsd * 100) / 100,
    last_updated: new Date().toLocaleTimeString('fr-FR', { hour12: false }),
  }
}
