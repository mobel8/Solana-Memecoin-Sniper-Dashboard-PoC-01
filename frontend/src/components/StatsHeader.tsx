import { Eye, Target, CheckCircle, BarChart2 } from 'lucide-react'

interface StatsHeaderProps {
  stats: {
    total: number
    sniped: number
    detected: number
  }
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  colorClass: string
  subLabel?: string
  pulse?: boolean
}

function StatCard({ icon, label, value, colorClass, subLabel, pulse }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-terminal-border rounded-lg bg-terminal-card hover:border-terminal-border/80 transition-colors">
      <div className={`flex-shrink-0 ${colorClass} ${pulse ? 'animate-pulse-slow' : ''}`}>
        {icon}
      </div>
      <div>
        <div className={`text-xl font-bold tabular-nums tracking-tight ${colorClass}`}>
          {value}
        </div>
        <div className="text-[10px] text-terminal-muted uppercase tracking-widest">
          {label}
        </div>
        {subLabel && (
          <div className="text-[10px] text-terminal-muted/50 mt-0.5">{subLabel}</div>
        )}
      </div>
    </div>
  )
}

export default function StatsHeader({ stats }: StatsHeaderProps) {
  const winRate = stats.total > 0
    ? `${Math.round((stats.sniped / stats.total) * 100)}%`
    : '—'

  return (
    <div className="border-b border-terminal-border bg-terminal-bg/60 px-4 py-3">
      <div className="max-w-[1920px] mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">

        <StatCard
          icon={<Eye className="w-5 h-5" />}
          label="Total Detected"
          value={stats.total}
          colorClass="text-terminal-blue"
          subLabel="all pools"
        />

        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Active"
          value={stats.detected}
          colorClass="text-terminal-green"
          subLabel="opportunities"
          pulse={stats.detected > 0}
        />

        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Sniped"
          value={stats.sniped}
          colorClass="text-terminal-yellow"
          subLabel="simulated txns"
        />

        <StatCard
          icon={<BarChart2 className="w-5 h-5" />}
          label="Win Rate"
          value={winRate}
          colorClass={stats.total > 0 && stats.sniped / stats.total > 0.3
            ? 'text-terminal-green'
            : 'text-terminal-muted'}
          subLabel="simulation only"
        />
      </div>
    </div>
  )
}
