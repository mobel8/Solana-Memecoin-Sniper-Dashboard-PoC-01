import { useState, useEffect, useCallback } from 'react'
import { Zap, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import TokenRow from './components/TokenRow'
import LogPanel from './components/LogPanel'
import StatsHeader from './components/StatsHeader'

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
  price_change_h1: number
  pair_created_at: number
  detected_at: string
  status: 'DETECTED' | 'SNIPED' | 'MISSED'
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
  message: string
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

  // ── Récupération des données depuis le backend Rust ────────────
  // useCallback mémoïse la fonction pour éviter de recréer l'interval
  // à chaque re-render (dépendances vides → stable pour toute la vie du composant)
  const fetchData = useCallback(async () => {
    try {
      // Promise.all : exécute les deux fetch EN PARALLÈLE (pas séquentiel)
      // Réduit la latence perçue par l'utilisateur de ~2x
      const [oppsRes, logsRes] = await Promise.all([
        fetch('/api/opportunities'),
        fetch('/api/logs'),
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
    } catch {
      // Le backend n'est pas encore démarré ou est injoignable
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

  // ── Statistiques calculées ──────────────────────────────────────
  const stats = {
    total:    opportunities.length,
    sniped:   opportunities.filter(o => o.status === 'SNIPED').length,
    detected: opportunities.filter(o => o.status === 'DETECTED').length,
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDU
  // ════════════════════════════════════════════════════════════════

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
              ) : (
                opportunities.map((opp) => (
                  <TokenRow
                    key={opp.id}
                    opportunity={opp}
                    onSnipe={handleSnipe}
                    isSniping={snipingToken === opp.token_address}
                  />
                ))
              )}
            </div>

            {/* Pied du panel */}
            <div className="px-5 py-2 border-t border-terminal-border/50 text-[10px] text-terminal-muted flex justify-between">
              <span>Showing {opportunities.length}/50 opportunities</span>
              <span>Refresh every 3s</span>
            </div>
          </div>
        </section>

        {/* Panel droit : Logs (33%) */}
        <aside className="w-full xl:w-[400px] flex-shrink-0">
          <LogPanel logs={logs} />
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
