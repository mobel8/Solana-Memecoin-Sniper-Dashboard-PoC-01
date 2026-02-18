import { useMemo, useState, useEffect } from 'react'
import {
  ArrowLeft, Zap, ExternalLink, TrendingUp, TrendingDown,
  Copy, Check, CheckCircle, RefreshCw, Activity, Shield,
  AlertTriangle, CheckCircle2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Opportunity } from '../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
//  Génère des données de prix simulées (déterministe via seed)
// ─────────────────────────────────────────────────────────────────────────────
function generateDetailChartData(
  basePrice: number,
  change1h: number,
  seed: string,
  points = 120,
): { v: number; label: string }[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const data: { v: number; label: string }[] = []
  for (let i = 0; i < points; i++) {
    const trend = (change1h / 100) * basePrice * (i / points) * 0.8
    const noise = (((hash * (i + 1) * 2654435761) >>> 0) / 0xFFFFFFFF - 0.5) * basePrice * 0.06
    const price = Math.max(basePrice * 0.01, basePrice + trend + noise)
    // Labels toutes les ~15 points (8 labels au total)
    const minutesAgo = Math.round((points - 1 - i) * (60 / points))
    const label = (i % 15 === 0 || i === points - 1)
      ? minutesAgo === 0 ? 'now' : `${minutesAgo}m`
      : ''
    data.push({ v: price, label })
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
  if (liq >= 1_000_000)  return `$${(liq / 1_000_000).toFixed(2)}M`
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
//  Tooltip du graphe principal
// ─────────────────────────────────────────────────────────────────────────────
const DetailTooltip = ({
  active, payload,
}: {
  active?: boolean
  payload?: { value: number }[]
}) => {
  if (active && payload?.length) {
    return (
      <div className="bg-terminal-card border border-terminal-border rounded px-3 py-2 text-xs text-terminal-yellow tabular-nums shadow-lg">
        <div className="text-terminal-muted text-[10px] mb-0.5">Price</div>
        <div className="font-bold">${formatPrice(payload[0].value)}</div>
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//  Spinner inline
// ─────────────────────────────────────────────────────────────────────────────
function RefreshIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Props
// ─────────────────────────────────────────────────────────────────────────────
interface TokenDetailProps {
  tokenAddress: string
  opportunities: Opportunity[]
  onBack: () => void
  onSnipe: (tokenAddress: string) => void
  isSniping: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TokenDetail({
  tokenAddress, opportunities, onBack, onSnipe, isSniping,
}: TokenDetailProps) {
  const opp = useMemo(
    () => opportunities.find(o => o.token_address === tokenAddress) ?? null,
    [opportunities, tokenAddress],
  )
  const loading = false
  const lastUpdate = useMemo(() => new Date().toLocaleTimeString('fr-FR', { hour12: false }), [opp?.id])
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedPair,  setCopiedPair]  = useState(false)

  // Scroll en haut à l'ouverture
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // ⚠ Doit être avant tout early return (Rules of Hooks)
  const chartData = useMemo(
    () => opp ? generateDetailChartData(opp.price_usd || 0.001, opp.price_change_h1, opp.id, 120) : [],
    [opp?.id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-terminal-bg font-mono flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-terminal-muted">
          <RefreshCw className="w-8 h-8 animate-spin text-terminal-green" />
          <span className="text-sm">Loading token data...</span>
        </div>
      </div>
    )
  }

  if (!opp) {
    return (
      <div className="min-h-screen bg-terminal-bg font-mono flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-terminal-muted">
          <div className="text-4xl text-terminal-red">⚠</div>
          <p className="text-sm text-terminal-red">Token not found</p>
          <button onClick={onBack} className="flex items-center gap-2 mt-4 px-4 py-2 rounded border border-terminal-border text-xs hover:border-terminal-green hover:text-terminal-green transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  const isPositive = (opp.price_change_h1 ?? 0) >= 0
  const isSniped   = opp.status === 'SNIPED'
  const canSnipe   = !isSniped && !isSniping
  const chartColor = isPositive ? 'rgb(var(--c-accent))' : 'rgb(var(--c-red))'
  const stopColor  = isPositive ? 'rgb(var(--c-accent))' : 'rgb(var(--c-red))'
  const gradId     = `detail-grad-${opp.id.slice(0, 8)}`

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

  return (
    <div className="min-h-screen bg-terminal-bg font-mono text-terminal-text scanline-overlay">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-terminal-border bg-terminal-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3 max-w-[1400px] mx-auto gap-4">

          {/* Gauche: back + token info */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border
                         text-xs text-terminal-muted hover:text-terminal-text hover:border-terminal-green
                         transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="w-px h-6 bg-terminal-border flex-shrink-0" />

            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex-shrink-0">
                <Activity className="w-5 h-5 text-terminal-green" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-terminal-green text-lg font-bold tracking-widest text-glow-green">
                    {opp.token_symbol}
                  </span>
                  <span className="text-terminal-muted text-sm truncate">{opp.token_name}</span>
                  {isSniped && (
                    <span className="text-[10px] bg-terminal-green/20 text-terminal-green border border-terminal-green/30 px-2 py-0.5 rounded flex-shrink-0">
                      SNIPED
                    </span>
                  )}
                  <span className="text-[10px] bg-terminal-card border border-terminal-border px-2 py-0.5 rounded text-terminal-muted uppercase flex-shrink-0">
                    {opp.dex_id}
                  </span>
                </div>
                <div className="text-[10px] text-terminal-muted mt-0.5">
                  {formatAge(opp.pair_created_at)} · Detected {opp.detected_at}
                  {lastUpdate && <span className="ml-2 opacity-50">· Updated {lastUpdate}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Droite: prix + actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <div className="text-xl font-bold text-terminal-yellow tabular-nums">
                ${formatPrice(opp.price_usd)}
              </div>
              <div className={`text-xs font-bold tabular-nums flex items-center gap-1 justify-end ${
                isPositive ? 'text-terminal-green' : 'text-terminal-red'
              }`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}{(opp.price_change_h1 ?? 0).toFixed(2)}% 1h
              </div>
            </div>

            {/* SNIPE */}
            <button
              onClick={() => canSnipe && onSnipe(opp.token_address)}
              disabled={!canSnipe}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded text-sm font-bold',
                'border transition-all duration-200',
                isSniped
                  ? 'bg-terminal-green/10 border-terminal-green/20 text-terminal-green/40 cursor-not-allowed'
                  : isSniping
                  ? 'bg-terminal-yellow/20 border-terminal-yellow text-terminal-yellow cursor-wait animate-pulse-slow'
                  : 'bg-terminal-green/10 border-terminal-green text-terminal-green hover:bg-terminal-green hover:text-terminal-bg active:scale-95 cursor-pointer',
              ].join(' ')}
            >
              {isSniped
                ? <><CheckCircle className="w-4 h-4" />SNIPED</>
                : isSniping
                ? <><RefreshIcon />SNIPING...</>
                : <><Zap className="w-4 h-4" />SNIPE</>
              }
            </button>

            {/* DexScreener */}
            <a
              href={`https://dexscreener.com/solana/${opp.pair_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-terminal-border
                         text-xs text-terminal-muted hover:text-terminal-blue hover:border-terminal-blue
                         transition-colors"
              title="View on DexScreener"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              DexScreener
            </a>
          </div>
        </div>
      </header>

      {/* ── CONTENU ───────────────────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto p-6 space-y-6">

        {/* ── GRAPHE PRINCIPAL ──────────────────────────────────────── */}
        <div className="border border-terminal-border rounded-lg bg-terminal-card overflow-hidden">

          {/* Header graphe */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border bg-terminal-bg/30">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-terminal-green/70" />
              </div>
              <span className="text-xs font-bold text-terminal-green tracking-widest uppercase ml-1">
                Price Chart — 1h
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
              <span className="text-xs text-terminal-muted">LIVE · 120 pts</span>
            </div>
          </div>

          {/* Graphe */}
          <div className="h-96 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={stopColor} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={stopColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgb(var(--c-border))"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'rgb(var(--c-muted))' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tickFormatter={v => v}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 9, fill: 'rgb(var(--c-muted))' }}
                  tickFormatter={formatPrice}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  orientation="right"
                />
                <Tooltip content={<DetailTooltip />} />
                <ReferenceLine
                  y={chartData[0]?.v}
                  stroke="rgb(var(--c-muted))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={chartColor}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── GRILLE D'INFOS ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* ─ Variations multi-timeframe ──────────────────────────── */}
          <div className="border border-terminal-border rounded-lg bg-terminal-card p-4">
            <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-terminal-blue/60 inline-block" />
              Price Change
            </div>
            <div className="space-y-3">
              {timeframes.map(({ label, value }) => {
                const pos = value >= 0
                return (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-terminal-muted text-sm w-8">{label}</span>
                    <div className="flex-1 mx-3">
                      <div className="h-1 bg-terminal-border/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pos ? 'bg-terminal-green/60' : 'bg-terminal-red/60'}`}
                          style={{ width: `${Math.min(100, Math.abs(value) * 2)}%`, marginLeft: pos ? 0 : 'auto' }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pos
                        ? <TrendingUp   className="w-3 h-3 text-terminal-green" />
                        : <TrendingDown className="w-3 h-3 text-terminal-red" />
                      }
                      <span className={`font-bold tabular-nums text-sm ${pos ? 'text-terminal-green' : 'text-terminal-red'}`}>
                        {pos ? '+' : ''}{value.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─ Transactions ────────────────────────────────────────── */}
          <div className="border border-terminal-border rounded-lg bg-terminal-card p-4">
            <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-terminal-purple/60 inline-block" />
              Transactions
            </div>
            <div className="space-y-4">
              {([
                { label: '1h',  buys: opp.txns_h1_buys ?? 0,  sells: opp.txns_h1_sells ?? 0,  total: totalH1,  ratio: buyRatioH1 },
                { label: '24h', buys: opp.txns_h24_buys ?? 0, sells: opp.txns_h24_sells ?? 0, total: totalH24, ratio: buyRatioH24 },
              ] as const).map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-terminal-muted font-bold">{row.label}</span>
                    <span>
                      <span className="text-terminal-green tabular-nums">{row.buys} B</span>
                      <span className="text-terminal-muted mx-1.5">/</span>
                      <span className="text-terminal-red tabular-nums">{row.sells} S</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-terminal-border/30 overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full bg-terminal-green/70 transition-all duration-500"
                      style={{ width: `${row.ratio * 100}%` }}
                    />
                    <div
                      className="h-full rounded-r-full bg-terminal-red/50 flex-1 transition-all duration-500"
                    />
                  </div>
                  {row.total > 0 && (
                    <div className="text-[10px] text-terminal-muted/60 mt-1 tabular-nums">
                      {row.total} total · {(row.ratio * 100).toFixed(0)}% buys
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─ Market Data ─────────────────────────────────────────── */}
          <div className="border border-terminal-border rounded-lg bg-terminal-card p-4">
            <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-terminal-yellow/60 inline-block" />
              Market
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Price USD',   value: `$${formatPrice(opp.price_usd)}` },
                { label: 'Market Cap',  value: opp.market_cap > 0 ? formatLiquidity(opp.market_cap) : '—' },
                { label: 'FDV',         value: opp.fdv        > 0 ? formatLiquidity(opp.fdv)        : '—' },
                { label: 'Liquidity',   value: opp.liquidity_usd > 0 ? formatLiquidity(opp.liquidity_usd) : '—' },
                { label: 'Vol 1h',      value: opp.volume_h1  > 0 ? formatLiquidity(opp.volume_h1)  : '—' },
                { label: 'Vol 6h',      value: opp.volume_h6  > 0 ? formatLiquidity(opp.volume_h6)  : '—' },
                { label: 'Vol 24h',     value: opp.volume_h24 > 0 ? formatLiquidity(opp.volume_h24) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-terminal-muted text-xs">{label}</span>
                  <span className="text-terminal-text tabular-nums text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Token Info ──────────────────────────────────────────── */}
          <div className="border border-terminal-border rounded-lg bg-terminal-card p-4">
            <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-terminal-green/60 inline-block" />
              Token Info
            </div>
            <div className="space-y-3">

              {/* Token Address */}
              <div>
                <div className="text-[10px] text-terminal-muted mb-1">Token Address</div>
                <div className="flex items-center gap-2 bg-terminal-bg/40 rounded px-2 py-1.5 border border-terminal-border/40">
                  <span className="text-[10px] text-terminal-purple/80 font-mono flex-1 truncate">
                    {opp.token_address}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(opp.token_address)
                      setCopiedToken(true)
                      setTimeout(() => setCopiedToken(false), 1500)
                    }}
                    className="text-terminal-muted/50 hover:text-terminal-blue transition-colors flex-shrink-0"
                  >
                    {copiedToken
                      ? <Check className="w-3 h-3 text-terminal-green" />
                      : <Copy  className="w-3 h-3" />
                    }
                  </button>
                </div>
              </div>

              {/* Pair Address */}
              <div>
                <div className="text-[10px] text-terminal-muted mb-1">Pair Address</div>
                <div className="flex items-center gap-2 bg-terminal-bg/40 rounded px-2 py-1.5 border border-terminal-border/40">
                  <span className="text-[10px] text-terminal-blue/80 font-mono flex-1 truncate">
                    {opp.pair_address}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(opp.pair_address)
                      setCopiedPair(true)
                      setTimeout(() => setCopiedPair(false), 1500)
                    }}
                    className="text-terminal-muted/50 hover:text-terminal-blue transition-colors flex-shrink-0"
                  >
                    {copiedPair
                      ? <Check className="w-3 h-3 text-terminal-green" />
                      : <Copy  className="w-3 h-3" />
                    }
                  </button>
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-1.5 pt-1 border-t border-terminal-border/30">
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-muted">DEX</span>
                  <span className="text-terminal-text uppercase font-medium">{opp.dex_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-muted">Pool Age</span>
                  <span className="text-terminal-text">{formatAge(opp.pair_created_at)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-muted">Status</span>
                  <span className={`font-bold ${
                    opp.status === 'SNIPED' ? 'text-terminal-green' :
                    opp.status === 'MISSED' ? 'text-terminal-red' :
                    'text-terminal-yellow'
                  }`}>{opp.status}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-muted">Detected At</span>
                  <span className="text-terminal-text tabular-nums">{opp.detected_at}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RISK ANALYSIS (full width) ─────────────────────────────── */}
        {opp.risk_score && (
          <div className="border border-terminal-border rounded-lg bg-terminal-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border bg-terminal-bg/30">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-terminal-green/70" />
                </div>
                <Shield className="w-3.5 h-3.5 text-terminal-yellow ml-1" />
                <span className="text-xs font-bold text-terminal-yellow tracking-widest uppercase">
                  Risk Analysis
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${
                  opp.risk_score.score >= 80 ? 'text-terminal-green' :
                  opp.risk_score.score >= 60 ? 'text-terminal-yellow' :
                  'text-terminal-red'
                }`}>
                  {opp.risk_score.score}/100
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                  opp.risk_score.level === 'SAFE'     ? 'border-terminal-green/30 bg-terminal-green/10 text-terminal-green' :
                  opp.risk_score.level === 'CAUTION'  ? 'border-terminal-yellow/30 bg-terminal-yellow/10 text-terminal-yellow' :
                  'border-terminal-red/30 bg-terminal-red/10 text-terminal-red'
                }`}>
                  {opp.risk_score.level}
                </span>
              </div>
            </div>
            <div className="p-5">
              {/* Score bar */}
              <div className="h-2 rounded-full bg-terminal-border/30 overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all ${
                    opp.risk_score.score >= 80 ? 'bg-terminal-green/70' :
                    opp.risk_score.score >= 60 ? 'bg-terminal-yellow/70' :
                    'bg-terminal-red/70'
                  }`}
                  style={{ width: `${opp.risk_score.score}%` }}
                />
              </div>
              {/* Flags grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {opp.risk_score.flags.map((flag, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded border ${
                    flag.passed
                      ? 'border-terminal-green/20 bg-terminal-green/[0.03]'
                      : flag.severity === 'danger'
                      ? 'border-terminal-red/20 bg-terminal-red/[0.03]'
                      : 'border-terminal-yellow/20 bg-terminal-yellow/[0.03]'
                  }`}>
                    {flag.passed
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-terminal-green flex-shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-terminal-red flex-shrink-0 mt-0.5" />
                    }
                    <div>
                      <div className="text-xs font-bold text-terminal-text">{flag.name}</div>
                      <div className="text-[10px] text-terminal-muted/80">{flag.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
