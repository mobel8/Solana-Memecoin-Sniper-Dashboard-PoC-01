import { useMemo, useState } from 'react'
import {
  Zap, ExternalLink, TrendingUp, TrendingDown,
  CheckCircle, Copy, Check, ChevronDown, Maximize2, Shield,
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line,
  ResponsiveContainer, Tooltip, CartesianGrid, YAxis,
} from 'recharts'
import { Opportunity } from '../App'

interface TokenRowProps {
  opportunity: Opportunity
  onSnipe: (tokenAddress: string) => void
  isSniping: boolean
  onViewDetail: (tokenAddress: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
//  Génère des données de prix simulées (déterministe via seed)
// ─────────────────────────────────────────────────────────────────────────────
function generateSparklineData(
  basePrice: number,
  change1h: number,
  seed: string,
  points = 24,
): { v: number }[] {
  const data: { v: number }[] = []
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  let price = basePrice
  for (let i = 0; i < points; i++) {
    const trend = (change1h / 100) * basePrice * (i / points) * 0.8
    const noise = (((hash * (i + 1) * 2654435761) >>> 0) / 0xFFFFFFFF - 0.5) * basePrice * 0.06
    price = Math.max(basePrice * 0.01, basePrice + trend + noise)
    data.push({ v: price })
  }
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
//  Formatage
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
  if (liq === 0)         return '—'
  if (liq >= 1_000_000)  return `$${(liq / 1_000_000).toFixed(1)}M`
  if (liq >= 1_000)      return `$${(liq / 1_000).toFixed(1)}K`
  return `$${liq.toFixed(0)}`
}

function formatAge(pairCreatedAt: number): string {
  if (!pairCreatedAt) return '—'
  const diffMs  = Date.now() - pairCreatedAt
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tooltip (mini sparkline)
// ─────────────────────────────────────────────────────────────────────────────
const MiniTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
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
//  Tooltip (graphe expandé)
// ─────────────────────────────────────────────────────────────────────────────
const ExpandedTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-terminal-card border border-terminal-border rounded px-2 py-1 text-[10px] text-terminal-yellow tabular-nums">
        ${formatPrice(payload[0].value)}
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//  Panel détail expandable
// ─────────────────────────────────────────────────────────────────────────────
function ExpandedPanel({
  opp,
  isPositive,
  chartColor,
  gradId,
}: {
  opp: Opportunity
  isPositive: boolean
  chartColor: string
  gradId: string
}) {
  // 60 points pour le grand graphe (plus lisse que le mini à 24)
  const expandedData = useMemo(
    () => generateSparklineData(opp.price_usd || 0.001, opp.price_change_h1, opp.id, 60),
    [opp.id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const totalH1  = (opp.txns_h1_buys ?? 0)  + (opp.txns_h1_sells ?? 0)
  const totalH24 = (opp.txns_h24_buys ?? 0) + (opp.txns_h24_sells ?? 0)
  const buyRatioH1  = totalH1  > 0 ? (opp.txns_h1_buys ?? 0)  / totalH1  : 0.5
  const buyRatioH24 = totalH24 > 0 ? (opp.txns_h24_buys ?? 0) / totalH24 : 0.5

  const timeframes = [
    { label: '5m',  value: opp.price_change_m5  ?? 0 },
    { label: '1h',  value: opp.price_change_h1  ?? 0 },
    { label: '6h',  value: opp.price_change_h6  ?? 0 },
    { label: '24h', value: opp.price_change_h24 ?? 0 },
  ]

  const marketInfo = [
    { label: 'Market Cap', value: opp.market_cap > 0 ? formatLiquidity(opp.market_cap) : '—' },
    { label: 'FDV',        value: opp.fdv        > 0 ? formatLiquidity(opp.fdv)        : '—' },
    { label: 'Vol 1h',     value: opp.volume_h1  > 0 ? formatLiquidity(opp.volume_h1)  : '—' },
    { label: 'Vol 6h',     value: opp.volume_h6  > 0 ? formatLiquidity(opp.volume_h6)  : '—' },
    { label: 'Vol 24h',    value: opp.volume_h24 > 0 ? formatLiquidity(opp.volume_h24) : '—' },
  ]

  const stopColor = isPositive ? 'rgb(var(--c-accent))' : 'rgb(var(--c-red))'

  return (
    <div className="border-t border-terminal-border/25 px-5 pt-3 pb-4 bg-terminal-bg/20">

      {/* ── Graphe area plein ──────────────────────────────────────── */}
      <div className="h-36 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={expandedData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={stopColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={stopColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgb(var(--c-border))"
              strokeOpacity={0.35}
              vertical={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 9, fill: 'rgb(var(--c-muted))' }}
              tickFormatter={formatPrice}
              axisLine={false}
              tickLine={false}
              width={58}
            />
            <Tooltip content={<ExpandedTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={chartColor}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Grille d'infos en 3 colonnes + risk ──────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">

        {/* ─ Variations multi-timeframe ─────────────────────────── */}
        <div>
          <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-terminal-blue/60 inline-block" />
            Price Change
          </div>
          <div className="space-y-1.5">
            {timeframes.map(({ label, value }) => {
              const pos = value >= 0
              return (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-terminal-muted w-7">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {pos
                      ? <TrendingUp   className="w-3 h-3 text-terminal-green" />
                      : <TrendingDown className="w-3 h-3 text-terminal-red" />
                    }
                    <span className={`font-bold tabular-nums text-xs ${pos ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pos ? '+' : ''}{value.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─ Transactions buy/sell ──────────────────────────────── */}
        <div>
          <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-terminal-purple/60 inline-block" />
            Transactions
          </div>
          <div className="space-y-3">
            {/* 1h */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-terminal-muted">1h</span>
                <span>
                  <span className="text-terminal-green tabular-nums">{opp.txns_h1_buys} B</span>
                  <span className="text-terminal-muted mx-1">/</span>
                  <span className="text-terminal-red tabular-nums">{opp.txns_h1_sells} S</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-terminal-border/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-terminal-green/70 transition-all duration-300"
                  style={{ width: `${buyRatioH1 * 100}%` }}
                />
              </div>
              {totalH1 > 0 && (
                <div className="text-[10px] text-terminal-muted/50 mt-0.5 tabular-nums">
                  {totalH1} total · ratio {(buyRatioH1 * 100).toFixed(0)}% buys
                </div>
              )}
            </div>

            {/* 24h */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-terminal-muted">24h</span>
                <span>
                  <span className="text-terminal-green tabular-nums">{opp.txns_h24_buys} B</span>
                  <span className="text-terminal-muted mx-1">/</span>
                  <span className="text-terminal-red tabular-nums">{opp.txns_h24_sells} S</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-terminal-border/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-terminal-green/70 transition-all duration-300"
                  style={{ width: `${buyRatioH24 * 100}%` }}
                />
              </div>
              {totalH24 > 0 && (
                <div className="text-[10px] text-terminal-muted/50 mt-0.5 tabular-nums">
                  {totalH24} total · ratio {(buyRatioH24 * 100).toFixed(0)}% buys
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─ Infos marché ───────────────────────────────────────── */}
        <div>
          <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 rounded-full bg-terminal-yellow/60 inline-block" />
            Market
          </div>
          <div className="space-y-1.5">
            {marketInfo.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-terminal-muted">{label}</span>
                <span className="text-terminal-text tabular-nums font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─ Risk Analysis ────────────────────────────────────── */}
        {opp.risk_score && (
          <div>
            <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-terminal-red/60 inline-block" />
              Risk Analysis
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-terminal-muted">Score</span>
                <span className={`font-bold tabular-nums ${
                  opp.risk_score.score >= 80 ? 'text-terminal-green' :
                  opp.risk_score.score >= 60 ? 'text-terminal-yellow' :
                  'text-terminal-red'
                }`}>
                  {opp.risk_score.score}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-terminal-border/30 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    opp.risk_score.score >= 80 ? 'bg-terminal-green/70' :
                    opp.risk_score.score >= 60 ? 'bg-terminal-yellow/70' :
                    'bg-terminal-red/70'
                  }`}
                  style={{ width: `${opp.risk_score.score}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              {opp.risk_score.flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  <span className={`flex-shrink-0 mt-0.5 ${
                    flag.passed ? 'text-terminal-green' : 'text-terminal-red'
                  }`}>
                    {flag.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-terminal-muted/80">{flag.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSANT TokenRow
// ─────────────────────────────────────────────────────────────────────────────
export default function TokenRow({ opportunity, onSnipe, isSniping, onViewDetail }: TokenRowProps) {
  const {
    token_name, token_symbol, token_address, pair_address,
    price_usd, liquidity_usd, volume_h1, price_change_h1,
    pair_created_at, dex_id, detected_at, status,
  } = opportunity

  const [copied,   setCopied]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(token_address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const isSniped   = status === 'SNIPED'
  const isPositive = (price_change_h1 ?? 0) >= 0
  const canSnipe   = !isSniped && !isSniping

  // CSS variables pour que le graphe suive la couleur accent du thème
  const chartColor = isPositive ? 'rgb(var(--c-accent))' : 'rgb(var(--c-red))'

  // ID unique pour le gradient SVG (évite les conflits entre instances)
  const gradId = `grad-${opportunity.id.slice(0, 8)}`

  const sparkData = useMemo(
    () => generateSparklineData(price_usd || 0.001, price_change_h1, opportunity.id),
    [opportunity.id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className={[
      'group animate-slide-in',
      isSniped  ? 'opacity-70' : '',
    ].join(' ')}>

      {/* ── Ligne principale (cliquable pour expand) ─────────────── */}
      <div
        onClick={() => setExpanded(v => !v)}
        className={[
          'grid grid-cols-1',
          'md:grid-cols-[minmax(140px,1.5fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(90px,1fr)_minmax(80px,0.8fr)_160px]',
          'gap-3 px-5 py-3 items-center cursor-pointer',
          'transition-colors duration-150',
          expanded
            ? 'bg-white/[0.03]'
            : 'hover:bg-white/[0.025]',
          isSniped  ? 'bg-terminal-green/[0.03]'    : '',
          isSniping ? 'bg-terminal-yellow/[0.05] animate-pulse-slow' : '',
        ].join(' ')}
      >
        {/* ── Col 1 : Token Info ──────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-green flex-shrink-0 shadow-green-glow" />
            <span className="text-sm font-bold text-terminal-text truncate">{token_symbol}</span>
            {isSniped && (
              <span className="text-[9px] bg-terminal-green/20 text-terminal-green border border-terminal-green/30 px-1 rounded flex-shrink-0">
                SNIPED
              </span>
            )}
            {opportunity.risk_score && (
              <RiskBadge score={opportunity.risk_score.score} level={opportunity.risk_score.level} />
            )}
          </div>
          <span className="text-xs text-terminal-muted truncate pl-3">{token_name}</span>
          <div className="flex items-center gap-2 pl-3">
            <span className="text-[10px] text-terminal-purple/70 font-mono">
              {token_address.slice(0, 6)}…{token_address.slice(-4)}
            </span>
            <button
              onClick={e => { e.stopPropagation(); handleCopy() }}
              title="Copy address"
              className="text-terminal-muted/40 hover:text-terminal-blue transition-colors flex-shrink-0"
            >
              {copied
                ? <Check className="w-2.5 h-2.5 text-terminal-green" />
                : <Copy  className="w-2.5 h-2.5" />
              }
            </button>
            <span className="text-[10px] text-terminal-muted/50">
              {formatAge(pair_created_at)}
            </span>
          </div>
        </div>

        {/* ── Col 2 : Prix + Mini Sparkline ───────────────────────── */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-terminal-yellow tabular-nums">
            ${formatPrice(price_usd)}
          </span>
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
                <Tooltip content={<MiniTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Col 3 : Liquidité + Volume 1h ───────────────────────── */}
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-terminal-blue tabular-nums">
            {formatLiquidity(liquidity_usd)}
          </span>
          <span className="text-[10px] text-terminal-muted">liq</span>
          {volume_h1 > 0 && (
            <span className="text-[10px] text-terminal-purple/60 tabular-nums">
              {formatLiquidity(volume_h1)} vol 1h
            </span>
          )}
        </div>

        {/* ── Col 4 : Variation 1h ─────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          {isPositive
            ? <TrendingUp   className="w-3.5 h-3.5 text-terminal-green flex-shrink-0" />
            : <TrendingDown className="w-3.5 h-3.5 text-terminal-red   flex-shrink-0" />
          }
          <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
            {isPositive ? '+' : ''}{(price_change_h1 ?? 0).toFixed(2)}%
          </span>
        </div>

        {/* ── Col 5 : DEX + heure ──────────────────────────────────── */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-terminal-muted uppercase tracking-wider">
            {dex_id}
          </span>
          <span className="text-[10px] text-terminal-muted/50">{detected_at}</span>
        </div>

        {/* ── Col 6 : Chevron expand + Actions ────────────────────── */}
        <div className="flex items-center gap-3 justify-end">

          {/* Indicateur expand */}
          <ChevronDown
            className={[
              'w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0',
              expanded
                ? 'rotate-180 text-terminal-green/70'
                : 'text-terminal-muted/30',
            ].join(' ')}
          />

          {/* Boutons action (stop propagation) */}
          <div
            className="flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            {/* SNIPE */}
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

            {/* Ouvrir page détail */}
            <button
              onClick={() => onViewDetail(token_address)}
              title={`Voir détails ${token_symbol}`}
              className="text-terminal-muted/50 hover:text-terminal-green transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* DexScreener */}
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
      </div>

      {/* ── Panel détail (visible si expanded) ──────────────────── */}
      {expanded && (
        <ExpandedPanel
          opp={opportunity}
          isPositive={isPositive}
          chartColor={chartColor}
          gradId={gradId}
        />
      )}
    </div>
  )
}

// ── Badge de risque ──────────────────────────────────────────────
function RiskBadge({ score, level }: { score: number; level: string }) {
  const colors = {
    SAFE:     'bg-terminal-green/15 text-terminal-green border-terminal-green/30',
    CAUTION:  'bg-terminal-yellow/15 text-terminal-yellow border-terminal-yellow/30',
    DANGER:   'bg-terminal-red/15 text-terminal-red border-terminal-red/30',
    CRITICAL: 'bg-terminal-red/25 text-terminal-red border-terminal-red/50',
  }[level] || 'bg-terminal-muted/15 text-terminal-muted border-terminal-border'

  return (
    <span className={`text-[8px] px-1 py-0 rounded border flex-shrink-0 flex items-center gap-0.5 tabular-nums ${colors}`}
          title={`Risk: ${level} (${score}/100)`}>
      <Shield className="w-2 h-2" />
      {score}
    </span>
  )
}

// Icône spinner inline
function RefreshIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}
