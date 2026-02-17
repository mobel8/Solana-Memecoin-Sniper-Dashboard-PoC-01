import { useRef, useEffect } from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import { LogEntry } from '../App'

interface LogPanelProps {
  logs: LogEntry[]
}

// Couleur selon le niveau de log
const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  INFO:    'text-terminal-blue',
  SUCCESS: 'text-terminal-green',
  WARNING: 'text-terminal-yellow',
  ERROR:   'text-terminal-red',
}

// Préfixe stylisé pour chaque niveau
const LEVEL_PREFIX: Record<LogEntry['level'], string> = {
  INFO:    '[INFO]  ',
  SUCCESS: '[OK]    ',
  WARNING: '[WARN]  ',
  ERROR:   '[ERROR] ',
}

// Fond subtil par niveau
const LEVEL_BG: Record<LogEntry['level'], string> = {
  INFO:    '',
  SUCCESS: 'bg-terminal-green/[0.03]',
  WARNING: 'bg-terminal-yellow/[0.04]',
  ERROR:   'bg-terminal-red/[0.06]',
}

export default function LogPanel({ logs }: LogPanelProps) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const isLockedRef = useRef(true) // Auto-scroll activé par défaut

  // Auto-scroll vers le bas quand de nouveaux logs arrivent
  // SEULEMENT si l'utilisateur n'a pas scrollé manuellement vers le haut
  useEffect(() => {
    if (isLockedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs.length])

  // Détecter si l'utilisateur scrolle manuellement
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    isLockedRef.current = isAtBottom
  }

  const errorCount   = logs.filter(l => l.level === 'ERROR').length
  const successCount = logs.filter(l => l.level === 'SUCCESS').length

  return (
    <div className="border border-terminal-border rounded-lg bg-terminal-card flex flex-col h-full min-h-[500px] xl:min-h-0 xl:h-[calc(100vh-180px)]">

      {/* ── En-tête du panel ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border flex-shrink-0 bg-terminal-bg/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-terminal-green/70" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-terminal-green ml-1" />
          <span className="text-xs font-bold text-terminal-green tracking-widest uppercase">
            System Logs
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {successCount > 0 && (
            <span className="text-terminal-green tabular-nums">{successCount} OK</span>
          )}
          {errorCount > 0 && (
            <span className="text-terminal-red tabular-nums">{errorCount} ERR</span>
          )}
          <span className="text-terminal-muted tabular-nums">{logs.length} lines</span>
        </div>
      </div>

      {/* ── Zone des logs (scrollable) ───────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-px text-xs"
      >
        {logs.length === 0 ? (
          <InitializingPlaceholder />
        ) : (
          // On affiche les logs du plus ancien au plus récent
          // (le backend renvoie les 100 derniers, du plus récent au plus ancien)
          [...logs].reverse().map((log) => (
            <LogLine key={log.id} log={log} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Pied de panel — ligne de prompt ─────────────────────── */}
      <div className="px-3 py-2 border-t border-terminal-border flex-shrink-0 bg-terminal-bg/20">
        <div className="flex items-center gap-2 text-[10px] text-terminal-muted">
          <span className="text-terminal-green font-bold">root@sniper</span>
          <span className="text-terminal-muted">:~$</span>
          <span className="text-terminal-text/60">monitoring solana network</span>
          <span className="text-terminal-green animate-blink font-bold">█</span>
        </div>
      </div>
    </div>
  )
}

// ── Ligne de log individuelle ────────────────────────────────────
function LogLine({ log }: { log: LogEntry }) {
  return (
    <div className={`flex gap-2 leading-relaxed rounded px-1 py-0.5 ${LEVEL_BG[log.level]}`}>
      {/* Timestamp */}
      <span className="text-terminal-muted/50 flex-shrink-0 tabular-nums select-none">
        {log.timestamp}
      </span>
      {/* Niveau */}
      <span className={`flex-shrink-0 font-bold select-none ${LEVEL_COLORS[log.level]}`}>
        {LEVEL_PREFIX[log.level]}
      </span>
      {/* Message */}
      <span className={`break-all ${log.level === 'SUCCESS' ? 'text-terminal-text' : 'text-terminal-text/75'}`}>
        {log.message}
      </span>
    </div>
  )
}

// ── Placeholder pendant l'initialisation ────────────────────────
function InitializingPlaceholder() {
  return (
    <div className="flex flex-col gap-1 py-4 text-terminal-muted/50">
      <div className="flex items-center gap-2">
        <span className="text-terminal-green animate-blink">█</span>
        <span>Waiting for backend...</span>
      </div>
      <div className="text-[10px] pl-4 text-terminal-muted/30">
        Start: <span className="text-terminal-green/60">cd backend && cargo run</span>
      </div>
    </div>
  )
}
