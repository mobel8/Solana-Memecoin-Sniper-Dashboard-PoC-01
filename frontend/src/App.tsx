import { useState, useEffect, useCallback, useMemo } from 'react'
import { Zap, Wifi, WifiOff, RefreshCw, SlidersHorizontal, Shield } from 'lucide-react'
import TokenRow from './components/TokenRow'
import LogPanel from './components/LogPanel'
import StatsHeader from './components/StatsHeader'
import ThemeSwitcher from './components/ThemeSwitcher'
import TokenDetail from './components/TokenDetail'
import NetworkBar from './components/NetworkBar'
import JitoPanel from './components/JitoPanel'
import { ThemeId, DEFAULT_THEME } from './themes'

// ════════════════════════════════════════════════════════════════
//  TYPES (miroir du modèle Rust — doit correspondre exactement
//  à ce que le backend sérialise en JSON)
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
  price_change_m5:  number
  price_change_h1:  number
  price_change_h6:  number
  price_change_h24: number
  market_cap: number
  fdv: number
  txns_h1_buys:  number
  txns_h1_sells: number
  txns_h24_buys:  number
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

// ── Types Jito Bundles ──────────────────────────────────────────
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

// ── Types Network Stats ─────────────────────────────────────────
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

// ── Types Risk Score ────────────────────────────────────────────
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

// ── Types Snipe History ─────────────────────────────────────────
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
//  COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [logs,          setLogs]          = useState<LogEntry[]>([])
  const [isConnected,   setIsConnected]   = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState<string>('')
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  // Token actuellement en cours de "snipe" (affiche l'animation)
  const [snipingToken,  setSnipingToken]  = useState<string | null>(null)
  // Navigation vers la page de détail
  const [detailAddress, setDetailAddress] = useState<string | null>(null)

  // ── Données infrastructure ─────────────────────────────────────
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null)
  const [jitoConfig,   setJitoConfig]   = useState<JitoConfig | null>(null)
  const [showJitoPanel, setShowJitoPanel] = useState(false)

  // ── Thème (persisté dans localStorage) ─────────────────────────
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem('sniper-theme') as ThemeId) || DEFAULT_THEME
  )

  // Applique le thème sur <html data-theme="..."> à chaque changement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sniper-theme', theme)
  }, [theme])

  // ── Récupération des données depuis le backend Rust ────────────
  // useCallback mémoïse la fonction pour éviter de recréer l'interval
  // à chaque re-render (dépendances vides → stable pour toute la vie du composant)
  const fetchData = useCallback(async () => {
    try {
      // Promise.all : exécute les fetch EN PARALLÈLE (pas séquentiel)
      const [oppsRes, logsRes, netRes, jitoRes] = await Promise.all([
        fetch('/api/opportunities'),
        fetch('/api/logs'),
        fetch('/api/network'),
        fetch('/api/jito/config'),
      ])

      if (oppsRes.ok && logsRes.ok) {
        const [oppsData, logsData]: [Opportunity[], LogEntry[]] = await Promise.all([
          oppsRes.json(),
          logsRes.json(),
        ])
        setOpportunities(oppsData)
        setLogs(logsData)
        setIsConnected(true)
        setLastUpdate(new Date().toLocaleTimeString('fr-FR', { hour12: false }))
      } else {
        setIsConnected(false)
      }

      if (netRes.ok)  setNetworkStats(await netRes.json())
      if (jitoRes.ok) setJitoConfig(await jitoRes.json())
    } catch {
      setIsConnected(false)
    }
  }, [])

  // Polling toutes les 3 secondes pour le dashboard "live"
  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 3000)
    return () => clearInterval(id) // Cleanup au démontage du composant
  }, [fetchData])

  // ── Handler SNIPE ───────────────────────────────────────────────
  const handleSnipe = async (tokenAddress: string) => {
    setSnipingToken(tokenAddress)
    try {
      const res = await fetch(`/api/snipe/${tokenAddress}`, { method: 'POST' })
      if (res.ok) {
        // Refresh immédiat pour voir le nouveau statut SNIPED
        await fetchData()
      }
    } finally {
      // Toujours réinitialiser l'état sniping, même en cas d'erreur
      setTimeout(() => setSnipingToken(null), 1500)
    }
  }

  // ── Refresh manuel ──────────────────────────────────────────────
  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // ── Clear logs ──────────────────────────────────────────────────
  const clearLogs = useCallback(async () => {
    await fetch('/api/logs', { method: 'DELETE' })
    setLogs([])
  }, [])

  // ── Update Jito config ────────────────────────────────────────
  const updateJitoConfig = useCallback(async (newConfig: JitoConfig) => {
    const res = await fetch('/api/jito/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    })
    if (res.ok) {
      setJitoConfig(newConfig)
    }
  }, [])

  // ── Filtre / Tri ────────────────────────────────────────────────
  type FilterStatus = 'ALL' | 'DETECTED' | 'SNIPED'
  type SortKey = 'newest' | 'change_desc' | 'change_asc' | 'liq_desc' | 'vol_desc'

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [sortBy,       setSortBy]       = useState<SortKey>('newest')
  const [filterDex,    setFilterDex]    = useState<string>('ALL')

  // Liste unique de DEX pour le sélecteur
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
      // newest : l'ordre du backend (les plus récents en premier) est conservé
    }
    return result
  }, [opportunities, filterStatus, sortBy, filterDex])

  // ── Statistiques calculées ──────────────────────────────────────
  const stats = {
    total:    opportunities.length,
    sniped:   opportunities.filter(o => o.status === 'SNIPED').length,
    detected: opportunities.filter(o => o.status === 'DETECTED').length,
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDU
  // ════════════════════════════════════════════════════════════════

  // Page de détail d'un token
  if (detailAddress) {
    return (
      <TokenDetail
        tokenAddress={detailAddress}
        onBack={() => setDetailAddress(null)}
        onSnipe={handleSnipe}
        isSniping={snipingToken === detailAddress}
      />
    )
  }

  return (
    <div className="min-h-screen bg-terminal-bg font-mono text-terminal-text scanline-overlay">

      {/* ── HEADER BARRE SUPÉRIEURE ─────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-terminal-border bg-terminal-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3 max-w-[1920px] mx-auto">

          {/* Logo / Titre */}
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

          {/* Status & Controls */}
          <div className="flex items-center gap-5">
            {/* Indicateur connexion */}
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

            {/* Dernière mise à jour */}
            {lastUpdate && (
              <span className="text-terminal-muted text-xs hidden sm:block">
                Updated {lastUpdate}
              </span>
            )}

            {/* Bouton refresh manuel */}
            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border
                         text-xs text-terminal-muted hover:text-terminal-text hover:border-terminal-blue
                         transition-colors duration-150"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Jito Config */}
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

            {/* Sélecteur de thème */}
            <ThemeSwitcher currentTheme={theme} onThemeChange={setTheme} />

            {/* Indicateur Rust backend */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded
                            border border-terminal-border/50 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-terminal-green' : 'bg-terminal-red'}`} />
              <span className="text-terminal-muted">Rust :8080</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── BARRE DE STATISTIQUES ───────────────────────────────── */}
      <StatsHeader stats={stats} />

      {/* ── BARRE RÉSEAU SOLANA ──────────────────────────────────── */}
      {networkStats && <NetworkBar stats={networkStats} />}

      {/* ── PANEL JITO CONFIG (collapsible) ──────────────────────── */}
      {showJitoPanel && jitoConfig && (
        <JitoPanel config={jitoConfig} onUpdate={updateJitoConfig} />
      )}

      {/* ── BARRE FILTRE / TRI ──────────────────────────────────── */}
      <div className="border-b border-terminal-border bg-terminal-bg/40 px-4 py-2">
        <div className="max-w-[1920px] mx-auto flex flex-wrap gap-x-5 gap-y-2 items-center text-xs">
          <div className="flex items-center gap-1.5 text-terminal-muted">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest">Filters</span>
          </div>

          {/* Status */}
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

          {/* Sort */}
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

          {/* DEX */}
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

      {/* ── CONTENU PRINCIPAL ───────────────────────────────────── */}
      <main className="max-w-[1920px] mx-auto p-4 flex flex-col xl:flex-row gap-4">

        {/* Panel gauche : liste des opportunités (66%) */}
        <section className="flex-1 min-w-0">
          <div className="border border-terminal-border rounded-lg bg-terminal-card overflow-hidden">

            {/* En-tête du panel */}
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

            {/* Ligne d'en-tête du tableau */}
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

            {/* Lignes de tokens */}
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

            {/* Pied du panel */}
            <div className="px-5 py-2 border-t border-terminal-border/50 text-[10px] text-terminal-muted flex justify-between">
              <span>Showing {filteredOpps.length}/{opportunities.length} opportunities</span>
              <span>Refresh every 3s</span>
            </div>
          </div>
        </section>

        {/* Panel droit : Logs (33%) */}
        <aside className="w-full xl:w-[400px] flex-shrink-0">
          <LogPanel logs={logs} onClearLogs={clearLogs} />
        </aside>
      </main>
    </div>
  )
}

// ── Composant état vide ─────────────────────────────────────────
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
          <p className="text-sm text-terminal-red">Backend offline</p>
          <p className="text-xs mt-2 text-terminal-muted">
            Start the Rust backend: <code className="text-terminal-green">cargo run</code> in /backend
          </p>
        </>
      )}
    </div>
  )
}
