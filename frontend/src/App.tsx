import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Zap, Wifi, WifiOff, RefreshCw, SlidersHorizontal, Shield } from 'lucide-react'
import TokenRow from './components/TokenRow'
import LogPanel from './components/LogPanel'
import StatsHeader from './components/StatsHeader'
import ThemeSwitcher from './components/ThemeSwitcher'
import TokenDetail from './components/TokenDetail'
import NetworkBar from './components/NetworkBar'
import JitoPanel from './components/JitoPanel'
import { ThemeId, DEFAULT_THEME } from './themes'
import {
  type Opportunity,
  type LogEntry,
  type JitoConfig,
  type NetworkStats,
  DEFAULT_JITO_CONFIG,
  DEFAULT_NETWORK_STATS,
  fetchNewOpportunities,
  simulateNetworkStats,
} from './lib/api'

// Re-export pour les composants qui importent depuis '../App'
export type { Opportunity, LogEntry, JitoConfig, NetworkStats }
export type { RiskFlag, RiskScore } from './lib/types'

// ════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function now(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)
}

function pushLog(
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>,
  level: LogEntry['level'],
  message: string,
) {
  setLogs(prev => {
    const next = [...prev, { id: uid(), timestamp: now(), level, message }]
    return next.length > 500 ? next.slice(-500) : next
  })
}

// ════════════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [logs,          setLogs]          = useState<LogEntry[]>([])
  const [isConnected,   setIsConnected]   = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState<string>('')
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  const [snipingToken,  setSnipingToken]  = useState<string | null>(null)
  const [detailAddress, setDetailAddress] = useState<string | null>(null)

  // ── Données infrastructure ─────────────────────────────────────
  const [networkStats, setNetworkStats] = useState<NetworkStats>(DEFAULT_NETWORK_STATS)
  const [jitoConfig,   setJitoConfig]   = useState<JitoConfig>(DEFAULT_JITO_CONFIG)
  const [showJitoPanel, setShowJitoPanel] = useState(false)

  // ── Thème ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem('sniper-theme') as ThemeId) || DEFAULT_THEME
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sniper-theme', theme)
  }, [theme])

  // ── Seen pairs cache (persist across renders) ─────────────────
  const seenPairsRef = useRef(new Set<string>())

  // ── Watcher: fetch DexScreener toutes les 10s ─────────────────
  const fetchData = useCallback(async () => {
    pushLog(setLogs, 'INFO', `Polling DexScreener...`)

    const result = await fetchNewOpportunities(seenPairsRef.current)

    if (result.error) {
      setIsConnected(false)
      pushLog(setLogs, 'ERROR', `Network error: ${result.error}`)
      return
    }

    setIsConnected(true)
    setLastUpdate(new Date().toLocaleTimeString('fr-FR', { hour12: false }))

    if (result.newOpportunities.length === 0) {
      pushLog(setLogs, 'INFO', `No new opportunities [query=${result.query}]. Watching...`)
    } else {
      // Ajouter en tête, garder max 50
      setOpportunities(prev => {
        const updated = [...result.newOpportunities, ...prev]
        return updated.slice(0, 50)
      })

      for (const opp of result.newOpportunities) {
        const short = `${opp.token_address.slice(0, 6)}...${opp.token_address.slice(-4)}`
        pushLog(setLogs, 'SUCCESS',
          `NEW POOL: ${opp.token_symbol} (${opp.dex_id}) | Liq $${Math.round(opp.liquidity_usd)} | $${opp.price_usd.toFixed(8)} | ${short}`
        )
      }
    }
  }, [])

  // Polling DexScreener toutes les 10s
  useEffect(() => {
    pushLog(setLogs, 'INFO', 'Watcher initialized — polling DexScreener every 10s')
    pushLog(setLogs, 'INFO', 'Connecting to DexScreener public API...')
    pushLog(setLogs, 'SUCCESS', 'Connection established')

    fetchData()
    const id = setInterval(fetchData, 10_000)
    return () => clearInterval(id)
  }, [fetchData])

  // ── Network stats simulation toutes les 30s ───────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setNetworkStats(prev => simulateNetworkStats(prev))
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Handler SNIPE (100% client-side) ──────────────────────────
  const handleSnipe = useCallback((tokenAddress: string) => {
    setSnipingToken(tokenAddress)

    // Mettre à jour le statut
    setOpportunities(prev =>
      prev.map(o => o.token_address === tokenAddress ? { ...o, status: 'SNIPED' as const } : o)
    )

    // Générer les logs de simulation
    const short = `${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-4)}`
    const fakeSig = `${uid().slice(0, 8)}...${uid().slice(0, 8)}`

    pushLog(setLogs, 'INFO', `SNIPE initiated → ${short}`)
    pushLog(setLogs, 'INFO', 'Constructing Jito Bundle (1 tx)...')
    pushLog(setLogs, 'INFO', 'Estimating optimal tip → 0.001 SOL (~$0.14)')
    pushLog(setLogs, 'INFO', 'Signing transaction with keypair...')
    pushLog(setLogs, 'INFO', `Submitting to Jito Block Engine (${jitoConfig.block_engine})...`)

    setTimeout(() => {
      pushLog(setLogs, 'SUCCESS', `Bundle accepted | Sig: ${fakeSig}`)
      pushLog(setLogs, 'SUCCESS', '[SIMULATION] No real funds were used.')
      setSnipingToken(null)
    }, 1500)
  }, [jitoConfig.block_engine])

  // ── Refresh manuel ────────────────────────────────────────────
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await fetchData()
    setTimeout(() => setIsRefreshing(false), 500)
  }, [fetchData])

  // ── Clear logs ────────────────────────────────────────────────
  const clearLogs = useCallback(() => setLogs([]), [])

  // ── Update Jito config (local) ────────────────────────────────
  const updateJitoConfig = useCallback((newConfig: JitoConfig) => {
    setJitoConfig(newConfig)
    pushLog(setLogs, 'INFO',
      `Jito config updated → strategy=${newConfig.tip_strategy}, tip=${newConfig.tip_min_sol}-${newConfig.tip_max_sol} SOL`)
  }, [])

  // ── Filtre / Tri ──────────────────────────────────────────────
  type FilterStatus = 'ALL' | 'DETECTED' | 'SNIPED'
  type SortKey = 'newest' | 'change_desc' | 'change_asc' | 'liq_desc' | 'vol_desc'

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [sortBy,       setSortBy]       = useState<SortKey>('newest')
  const [filterDex,    setFilterDex]    = useState<string>('ALL')

  const dexOptions = useMemo(() => {
    const ids = new Set(opportunities.map(o => o.dex_id).filter(Boolean))
    return ['ALL', ...Array.from(ids).sort()]
  }, [opportunities])

  const filteredOpps = useMemo(() => {
    let result = [...opportunities]
    if (filterStatus !== 'ALL')
      result = result.filter(o => o.status === filterStatus)
    if (filterDex !== 'ALL')
      result = result.filter(o => o.dex_id === filterDex)
    switch (sortBy) {
      case 'change_desc': result.sort((a, b) => b.price_change_h1 - a.price_change_h1); break
      case 'change_asc':  result.sort((a, b) => a.price_change_h1 - b.price_change_h1); break
      case 'liq_desc':    result.sort((a, b) => b.liquidity_usd   - a.liquidity_usd);   break
      case 'vol_desc':    result.sort((a, b) => b.volume_h1       - a.volume_h1);       break
    }
    return result
  }, [opportunities, filterStatus, sortBy, filterDex])

  const stats = {
    total:    opportunities.length,
    sniped:   opportunities.filter(o => o.status === 'SNIPED').length,
    detected: opportunities.filter(o => o.status === 'DETECTED').length,
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDU
  // ════════════════════════════════════════════════════════════════

  if (detailAddress) {
    return (
      <TokenDetail
        tokenAddress={detailAddress}
        opportunities={opportunities}
        onBack={() => setDetailAddress(null)}
        onSnipe={handleSnipe}
        isSniping={snipingToken === detailAddress}
      />
    )
  }

  return (
    <div className="min-h-screen bg-terminal-bg font-mono text-terminal-text scanline-overlay">

      {/* ── HEADER ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-terminal-border bg-terminal-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3 max-w-[1920px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Zap className="w-6 h-6 text-terminal-green" />
              <div className="absolute inset-0 animate-ping">
                <Zap className="w-6 h-6 text-terminal-green opacity-20" />
              </div>
            </div>
            <div>
              <span className="text-terminal-green text-lg font-bold tracking-widest text-glow-green">
                SOLANA SNIPER
              </span>
              <span className="text-terminal-muted text-xs ml-2">PoC — 01 Studio</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              {isConnected
                ? <Wifi    className="w-4 h-4 text-terminal-green" />
                : <WifiOff className="w-4 h-4 text-terminal-red" />
              }
              <span className={`text-xs font-bold ${isConnected ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
              {isConnected && (
                <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse ml-1" />
              )}
            </div>

            {lastUpdate && (
              <span className="text-terminal-muted text-xs hidden sm:block">
                Updated {lastUpdate}
              </span>
            )}

            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border
                         text-xs text-terminal-muted hover:text-terminal-text hover:border-terminal-blue
                         transition-colors duration-150"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={() => setShowJitoPanel(!showJitoPanel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors ${
                showJitoPanel
                  ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                  : 'border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-terminal-blue'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Jito
            </button>

            <ThemeSwitcher currentTheme={theme} onThemeChange={setTheme} />

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded
                            border border-terminal-border/50 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-terminal-green' : 'bg-terminal-red'}`} />
              <span className="text-terminal-muted">Vercel</span>
            </div>
          </div>
        </div>
      </header>

      <StatsHeader stats={stats} />

      <NetworkBar stats={networkStats} />

      {showJitoPanel && (
        <JitoPanel config={jitoConfig} onUpdate={updateJitoConfig} />
      )}

      {/* ── BARRE FILTRE / TRI ────────────────────────────────── */}
      <div className="border-b border-terminal-border bg-terminal-bg/40 px-4 py-2">
        <div className="max-w-[1920px] mx-auto flex flex-wrap gap-x-5 gap-y-2 items-center text-xs">
          <div className="flex items-center gap-1.5 text-terminal-muted">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest">Filters</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-terminal-muted uppercase tracking-widest">Status</span>
            <div className="flex gap-1">
              {(['ALL', 'DETECTED', 'SNIPED'] as FilterStatus[]).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    filterStatus === s
                      ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                      : 'border-terminal-border text-terminal-muted hover:border-terminal-green/40 hover:text-terminal-text'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-terminal-muted uppercase tracking-widest">Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
              className="bg-terminal-card border border-terminal-border rounded px-2 py-0.5
                         text-[10px] text-terminal-text focus:outline-none focus:border-terminal-blue">
              <option value="newest">Newest</option>
              <option value="change_desc">▲ Change 1h</option>
              <option value="change_asc">▼ Change 1h</option>
              <option value="liq_desc">▲ Liquidity</option>
              <option value="vol_desc">▲ Volume 1h</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-terminal-muted uppercase tracking-widest">DEX</span>
            <select value={filterDex} onChange={e => setFilterDex(e.target.value)}
              className="bg-terminal-card border border-terminal-border rounded px-2 py-0.5
                         text-[10px] text-terminal-text focus:outline-none focus:border-terminal-blue">
              {dexOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <span className="ml-auto text-[10px] text-terminal-muted tabular-nums">
            {filteredOpps.length}/{opportunities.length} tokens
          </span>
        </div>
      </div>

      {/* ── CONTENU PRINCIPAL ─────────────────────────────────── */}
      <main className="max-w-[1920px] mx-auto p-4 flex flex-col xl:flex-row gap-4">

        <section className="flex-1 min-w-0">
          <div className="border border-terminal-border rounded-lg bg-terminal-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border bg-terminal-bg/30">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-terminal-green/70" />
                </div>
                <span className="text-xs font-bold text-terminal-green tracking-widest uppercase ml-1">
                  Live Opportunities
                </span>
                <span className="bg-terminal-green text-terminal-bg text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums">
                  {stats.detected}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
                <span className="text-xs text-terminal-muted">SCANNING SOLANA</span>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-[minmax(140px,1.5fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(90px,1fr)_minmax(80px,0.8fr)_140px]
                            gap-3 px-5 py-2 border-b border-terminal-border/50
                            text-[10px] text-terminal-muted uppercase tracking-widest font-bold">
              <span>Token / Address</span>
              <span>Price USD</span>
              <span>Liquidity</span>
              <span>1h Change</span>
              <span>DEX</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-terminal-border/20">
              {opportunities.length === 0 ? (
                <EmptyState isConnected={isConnected} />
              ) : filteredOpps.length === 0 ? (
                <div className="py-12 text-center text-terminal-muted text-xs">
                  No tokens match current filters
                </div>
              ) : (
                filteredOpps.map((opp) => (
                  <TokenRow
                    key={opp.id}
                    opportunity={opp}
                    onSnipe={handleSnipe}
                    isSniping={snipingToken === opp.token_address}
                    onViewDetail={setDetailAddress}
                  />
                ))
              )}
            </div>

            <div className="px-5 py-2 border-t border-terminal-border/50 text-[10px] text-terminal-muted flex justify-between">
              <span>Showing {filteredOpps.length}/{opportunities.length} opportunities</span>
              <span>Refresh every 10s</span>
            </div>
          </div>
        </section>

        <aside className="w-full xl:w-[400px] flex-shrink-0">
          <LogPanel logs={logs} onClearLogs={clearLogs} />
        </aside>
      </main>
    </div>
  )
}

function EmptyState({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-terminal-muted">
      {isConnected ? (
        <>
          <div className="text-4xl mb-4 text-terminal-green font-bold tracking-wider">
            ⟩_ <span className="animate-blink">█</span>
          </div>
          <p className="text-sm text-terminal-text/70">Scanning Solana network...</p>
          <p className="text-xs mt-2 text-terminal-muted">
            Waiting for new pool detections · polling DexScreener
          </p>
        </>
      ) : (
        <>
          <div className="text-4xl mb-4 text-terminal-red">⚠</div>
          <p className="text-sm text-terminal-red">Connecting to DexScreener...</p>
          <p className="text-xs mt-2 text-terminal-muted">
            Waiting for API response
          </p>
        </>
      )}
    </div>
  )
}
