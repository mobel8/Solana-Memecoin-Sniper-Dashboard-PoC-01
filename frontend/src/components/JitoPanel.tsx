import { useState } from 'react'
import { Shield, Zap, Globe, Settings, Save, RotateCcw } from 'lucide-react'
import { JitoConfig } from '../App'

interface JitoPanelProps {
  config: JitoConfig
  onUpdate: (config: JitoConfig) => void
}

const BLOCK_ENGINES = [
  { id: 'amsterdam', label: 'Amsterdam', flag: 'EU', latency: '~25ms' },
  { id: 'frankfurt',  label: 'Frankfurt',  flag: 'EU', latency: '~22ms' },
  { id: 'new-york',   label: 'New York',   flag: 'US', latency: '~45ms' },
  { id: 'tokyo',      label: 'Tokyo',      flag: 'JP', latency: '~120ms' },
]

const TIP_STRATEGIES = [
  { id: 'fixed',      label: 'Fixed',      desc: 'Constant tip amount' },
  { id: 'dynamic',    label: 'Dynamic',    desc: 'Adjusts to network congestion' },
  { id: 'aggressive', label: 'Aggressive', desc: 'Max tip for guaranteed inclusion' },
]

export default function JitoPanel({ config, onUpdate }: JitoPanelProps) {
  const [draft, setDraft] = useState<JitoConfig>({ ...config })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onUpdate(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleReset = () => {
    setDraft({ ...config })
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(config)

  return (
    <div className="border-b border-terminal-border bg-terminal-card/60 px-4 py-3 animate-slide-in">
      <div className="max-w-[1920px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-terminal-green" />
            <span className="text-xs font-bold text-terminal-green tracking-widest uppercase">
              Jito Bundle Engine
            </span>
            <span className="text-[10px] text-terminal-muted bg-terminal-bg/40 px-1.5 py-0.5 rounded border border-terminal-border/40">
              SIMULATION MODE
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px]
                           border border-terminal-border text-terminal-muted
                           hover:text-terminal-text hover:border-terminal-yellow transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex items-center gap-1 px-3 py-1 rounded text-[10px] font-bold
                         border transition-all ${
                saved
                  ? 'border-terminal-green bg-terminal-green/20 text-terminal-green'
                  : hasChanges
                  ? 'border-terminal-green bg-terminal-green/10 text-terminal-green hover:bg-terminal-green hover:text-terminal-bg cursor-pointer'
                  : 'border-terminal-border/40 text-terminal-muted/40 cursor-not-allowed'
              }`}
            >
              <Save className="w-3 h-3" />
              {saved ? 'Saved!' : 'Apply'}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">

          {/* Block Engine */}
          <div>
            <label className="text-[10px] text-terminal-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Block Engine
            </label>
            <div className="space-y-1">
              {BLOCK_ENGINES.map(be => (
                <button
                  key={be.id}
                  onClick={() => setDraft(d => ({ ...d, block_engine: be.id }))}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded border text-[10px] transition-colors ${
                    draft.block_engine === be.id
                      ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                      : 'border-terminal-border/40 text-terminal-muted hover:border-terminal-green/40'
                  }`}
                >
                  <span>{be.flag} {be.label}</span>
                  <span className="opacity-50">{be.latency}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tip Strategy */}
          <div>
            <label className="text-[10px] text-terminal-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Tip Strategy
            </label>
            <div className="space-y-1 mb-3">
              {TIP_STRATEGIES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setDraft(d => ({ ...d, tip_strategy: s.id }))}
                  className={`w-full text-left px-2 py-1 rounded border text-[10px] transition-colors ${
                    draft.tip_strategy === s.id
                      ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                      : 'border-terminal-border/40 text-terminal-muted hover:border-terminal-green/40'
                  }`}
                >
                  <div className="font-bold">{s.label}</div>
                  <div className="opacity-60 text-[9px]">{s.desc}</div>
                </button>
              ))}
            </div>

            {/* Tip Range */}
            <div className="flex gap-2">
              <div>
                <label className="text-[9px] text-terminal-muted">Min Tip (SOL)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={draft.tip_min_sol}
                  onChange={e => setDraft(d => ({ ...d, tip_min_sol: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-yellow tabular-nums focus:outline-none focus:border-terminal-blue"
                />
              </div>
              <div>
                <label className="text-[9px] text-terminal-muted">Max Tip (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  value={draft.tip_max_sol}
                  onChange={e => setDraft(d => ({ ...d, tip_max_sol: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-yellow tabular-nums focus:outline-none focus:border-terminal-blue"
                />
              </div>
            </div>
          </div>

          {/* Transaction Settings */}
          <div>
            <label className="text-[10px] text-terminal-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Settings className="w-3 h-3" /> Transaction
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-[9px] text-terminal-muted">Slippage (bps)</label>
                <input
                  type="number"
                  value={draft.slippage_bps}
                  onChange={e => setDraft(d => ({ ...d, slippage_bps: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-text tabular-nums focus:outline-none focus:border-terminal-blue"
                />
                <span className="text-[9px] text-terminal-muted/50">{draft.slippage_bps / 100}% slippage tolerance</span>
              </div>
              <div>
                <label className="text-[9px] text-terminal-muted">Compute Unit Limit</label>
                <input
                  type="number"
                  step="10000"
                  value={draft.compute_unit_limit}
                  onChange={e => setDraft(d => ({ ...d, compute_unit_limit: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-text tabular-nums focus:outline-none focus:border-terminal-blue"
                />
              </div>
              <div>
                <label className="text-[9px] text-terminal-muted">Priority Fee (μL/CU)</label>
                <input
                  type="number"
                  step="1000"
                  value={draft.priority_fee_micro_lamports}
                  onChange={e => setDraft(d => ({ ...d, priority_fee_micro_lamports: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-text tabular-nums focus:outline-none focus:border-terminal-blue"
                />
              </div>
            </div>
          </div>

          {/* Protection */}
          <div>
            <label className="text-[10px] text-terminal-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Protection
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.anti_sandwich}
                  onChange={e => setDraft(d => ({ ...d, anti_sandwich: e.target.checked }))}
                  className="accent-terminal-green"
                />
                <div>
                  <div className="text-[10px] text-terminal-text">Anti-Sandwich</div>
                  <div className="text-[9px] text-terminal-muted/60">
                    Jito bundles are atomic — native front-running protection
                  </div>
                </div>
              </label>

              <div>
                <label className="text-[9px] text-terminal-muted">Max Txns/Bundle</label>
                <select
                  value={draft.max_txns_per_bundle}
                  onChange={e => setDraft(d => ({ ...d, max_txns_per_bundle: +e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px]
                             text-terminal-text focus:outline-none focus:border-terminal-blue"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} transaction{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div className="mt-2 p-2 rounded border border-terminal-border/30 bg-terminal-bg/30 text-[10px]">
                <div className="text-terminal-muted mb-1 font-bold">Estimated Cost</div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Tip</span>
                  <span className="text-terminal-yellow tabular-nums">
                    {draft.tip_min_sol}–{draft.tip_max_sol} SOL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Priority Fee</span>
                  <span className="text-terminal-text tabular-nums">
                    ~{((draft.priority_fee_micro_lamports * draft.compute_unit_limit) / 1e9).toFixed(6)} SOL
                  </span>
                </div>
                <div className="flex justify-between border-t border-terminal-border/20 mt-1 pt-1">
                  <span className="text-terminal-muted font-bold">Total</span>
                  <span className="text-terminal-green font-bold tabular-nums">
                    ~{(draft.tip_min_sol + (draft.priority_fee_micro_lamports * draft.compute_unit_limit) / 1e9).toFixed(6)} SOL
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
