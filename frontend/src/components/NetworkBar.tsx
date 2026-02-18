import { Activity, Cpu, Gauge, DollarSign, Users, Clock } from 'lucide-react'
import { NetworkStats } from '../App'

interface NetworkBarProps {
  stats: NetworkStats
}

export default function NetworkBar({ stats }: NetworkBarProps) {
  const congestionColor = {
    low:    'text-terminal-green',
    medium: 'text-terminal-yellow',
    high:   'text-terminal-red',
  }[stats.congestion_level] || 'text-terminal-muted'

  const congestionBg = {
    low:    'bg-terminal-green/10',
    medium: 'bg-terminal-yellow/10',
    high:   'bg-terminal-red/10',
  }[stats.congestion_level] || ''

  return (
    <div className="border-b border-terminal-border bg-terminal-card/40 px-4 py-1.5">
      <div className="max-w-[1920px] mx-auto flex flex-wrap gap-x-5 gap-y-1 items-center text-[10px]">

        {/* Label */}
        <div className="flex items-center gap-1.5 text-terminal-muted">
          <Activity className="w-3 h-3 text-terminal-blue" />
          <span className="uppercase tracking-widest font-bold">Solana Network</span>
        </div>

        {/* TPS */}
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-terminal-muted" />
          <span className="text-terminal-muted">TPS</span>
          <span className="text-terminal-text font-bold tabular-nums">{stats.tps.toLocaleString()}</span>
        </div>

        {/* Slot */}
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-terminal-muted" />
          <span className="text-terminal-muted">Slot</span>
          <span className="text-terminal-text font-bold tabular-nums">{stats.current_slot.toLocaleString()}</span>
        </div>

        {/* Epoch */}
        <div className="flex items-center gap-1">
          <span className="text-terminal-muted">Epoch</span>
          <span className="text-terminal-text tabular-nums">{stats.epoch}</span>
        </div>

        {/* Priority Fee */}
        <div className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-terminal-muted" />
          <span className="text-terminal-muted">Priority</span>
          <span className="text-terminal-yellow font-bold tabular-nums">
            {stats.priority_fee_estimate.toLocaleString()} μL/CU
          </span>
        </div>

        {/* Congestion */}
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${congestionBg}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${congestionColor.replace('text-', 'bg-')} ${
            stats.congestion_level === 'high' ? 'animate-pulse' : ''
          }`} />
          <span className={`font-bold uppercase ${congestionColor}`}>
            {stats.congestion_level}
          </span>
        </div>

        {/* Validators */}
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-terminal-muted" />
          <span className="text-terminal-text tabular-nums">{stats.active_validators.toLocaleString()}</span>
        </div>

        {/* SOL Price */}
        <div className="flex items-center gap-1 ml-auto">
          <DollarSign className="w-3 h-3 text-terminal-yellow" />
          <span className="text-terminal-muted">SOL</span>
          <span className="text-terminal-yellow font-bold tabular-nums">
            ${stats.sol_price_usd.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
