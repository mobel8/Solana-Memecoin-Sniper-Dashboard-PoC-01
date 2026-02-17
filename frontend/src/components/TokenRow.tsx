import { useMemo } from 'react'
import { Zap, ExternalLink, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react'
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts'
import { Opportunity } from '../App'

interface TokenRowProps {
  opportunity: Opportunity
  onSnipe: (tokenAddress: string) => void
  isSniping: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
//  Génère des données de prix simulées pour le mini-graphique Recharts.
//  Crée une courbe réaliste : tendance directionnelle + bruit aléatoire.
//
//  Note : `seed` est utilisé pour que le graphique soit STABLE entre les
//  re-renders (même token = mêmes données). On évite Math.random() pur.
// ─────────────────────────────────────────────────────────────────────────────
function generateSparklineData(basePrice: number, change1h: number, seed: string): { v: number }[] {
  const points = 24
  const data: { v: number }[] = []

  // Pseudo-random déterministe basé sur le seed (adresse du token)
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }

  let price = basePrice
  for (let i = 0; i < points; i++) {
    // Tendance directionnelle selon change1h
    const trend = (change1h / 100) * basePrice * (i / points) * 0.8
    // Bruit pseudo-aléatoire déterministe
    const noise = (((hash * (i + 1) * 2654435761) >>> 0) / 0xFFFFFFFF - 0.5) * basePrice * 0.06
    price = Math.max(basePrice * 0.01, basePrice + trend + noise)
    data.push({ v: price })
  }
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
//  Formatage des prix et métriques
// ─────────────────────────────────────────────────────────────────────────────
function formatPrice(price: number): string {
  if (price === 0) return '—'
  if (price < 0.000001) return price.toExponential(2)
  if (price < 0.0001)   return price.toFixed(8)
  if (price < 0.01)     return price.toFixed(6)
  if (price < 1)        return price.toFixed(4)
  return price.toFixed(2)
}

function formatLiquidity(liq: number): string {
  if (liq === 0)       return '—'
  if (liq >= 1_000_000) return `$${(liq / 1_000_000).toFixed(1)}M`
  if (liq >= 1_000)     return `$${(liq / 1_000).toFixed(1)}K`
  return `$${liq.toFixed(0)}`
}

function formatAge(pairCreatedAt: number): string {
  if (!pairCreatedAt) return '—'
  const diffMs = Date.now() - pairCreatedAt
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60)   return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tooltip custom pour le mini-graphique (discret, terminal style)
// ─────────────────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-terminal-card border border-terminal-border rounded px-2 py-1 text-[10px] text-terminal-yellow">
        ${formatPrice(payload[0].value)}
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSANT TokenRow
// ─────────────────────────────────────────────────────────────────────────────
export default function TokenRow({ opportunity, onSnipe, isSniping }: TokenRowProps) {
  const {
    token_name, token_symbol, token_address, pair_address,
    price_usd, liquidity_usd, price_change_h1,
    pair_created_at, dex_id, detected_at, status,
  } = opportunity

  const isSniped   = status === 'SNIPED'
  const isPositive = price_change_h1 >= 0
  const canSnipe   = !isSniped && !isSniping

  // useMemo : Ne recalcule les données du graphique que si l'ID change
  // (i.e. un nouveau token). Évite de régénérer 24 points à chaque re-render.
  const sparkData = useMemo(
    () => generateSparklineData(price_usd || 0.001, price_change_h1, opportunity.id),
    [opportunity.id] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const chartColor = isPositive ? '#00ff88' : '#ff4455'

  return (
    <div
      className={[
        'group animate-slide-in',
        'grid grid-cols-1 md:grid-cols-[minmax(140px,1.5fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(90px,1fr)_minmax(80px,0.8fr)_140px]',
        'gap-3 px-5 py-3 items-center',
        'hover:bg-white/[0.025] transition-colors duration-150',
        isSniped  ? 'opacity-70 bg-terminal-green/[0.03]' : '',
        isSniping ? 'bg-terminal-yellow/[0.05] animate-pulse-slow' : '',
      ].join(' ')}
    >
      {/* ── Colonne 1 : Token Info ───────────────────────────────── */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-green flex-shrink-0 shadow-green-glow" />
          <span className="text-sm font-bold text-terminal-text truncate">{token_symbol}</span>
          {isSniped && (
            <span className="text-[9px] bg-terminal-green/20 text-terminal-green border border-terminal-green/30 px-1 rounded flex-shrink-0">
              SNIPED
            </span>
          )}
        </div>
        <span className="text-xs text-terminal-muted truncate pl-3">{token_name}</span>
        <div className="flex items-center gap-2 pl-3">
          <span className="text-[10px] text-terminal-purple/70 font-mono">
            {token_address.slice(0, 6)}…{token_address.slice(-4)}
          </span>
          <span className="text-[10px] text-terminal-muted/50">
            {formatAge(pair_created_at)}
          </span>
        </div>
      </div>

      {/* ── Colonne 2 : Prix + Sparkline ────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-terminal-yellow tabular-nums">
          ${formatPrice(price_usd)}
        </span>
        {/* Mini graphique de prix (24 points simulés) */}
        <div className="h-8 w-28 opacity-80 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={chartColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip content={<CustomTooltip />} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Colonne 3 : Liquidité ────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-terminal-blue tabular-nums">
          {formatLiquidity(liquidity_usd)}
        </span>
        <span className="text-[10px] text-terminal-muted">liquidity</span>
      </div>

      {/* ── Colonne 4 : Variation 1h ─────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {isPositive
          ? <TrendingUp   className="w-3.5 h-3.5 text-terminal-green flex-shrink-0" />
          : <TrendingDown className="w-3.5 h-3.5 text-terminal-red flex-shrink-0" />
        }
        <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
          {isPositive ? '+' : ''}{price_change_h1.toFixed(2)}%
        </span>
      </div>

      {/* ── Colonne 5 : DEX + heure détection ───────────────────── */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-terminal-muted uppercase tracking-wider">
          {dex_id}
        </span>
        <span className="text-[10px] text-terminal-muted/50">{detected_at}</span>
      </div>

      {/* ── Colonne 6 : Actions ──────────────────────────────────── */}
      <div className="flex items-center gap-2 justify-end">
        {/* Bouton SNIPE */}
        <button
          onClick={() => canSnipe && onSnipe(token_address)}
          disabled={!canSnipe}
          title={isSniped ? 'Already sniped' : `Snipe ${token_symbol}`}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold',
            'border transition-all duration-200',
            isSniped
              ? 'bg-terminal-green/10 border-terminal-green/20 text-terminal-green/40 cursor-not-allowed'
              : isSniping
              ? 'bg-terminal-yellow/20 border-terminal-yellow text-terminal-yellow cursor-wait animate-pulse-slow'
              : 'bg-terminal-green/10 border-terminal-green text-terminal-green hover:bg-terminal-green hover:text-terminal-bg active:scale-95 cursor-pointer',
          ].join(' ')}
        >
          {isSniped
            ? <><CheckCircle className="w-3 h-3" />SNIPED</>
            : isSniping
            ? <><RefreshIcon />SNIPING...</>
            : <><Zap className="w-3 h-3" />SNIPE</>
          }
        </button>

        {/* Lien DexScreener */}
        <a
          href={`https://dexscreener.com/solana/${pair_address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-terminal-muted hover:text-terminal-blue transition-colors"
          title="View on DexScreener"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

// Petite icône spinner inline
function RefreshIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}
