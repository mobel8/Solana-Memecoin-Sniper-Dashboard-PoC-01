import { useState } from 'react'
import { Palette, X, Check } from 'lucide-react'
import { THEMES, ThemeId } from '../themes'

interface ThemeSwitcherProps {
  currentTheme: ThemeId
  onThemeChange: (id: ThemeId) => void
}

export default function ThemeSwitcher({ currentTheme, onThemeChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">

      {/* ── Bouton déclencheur ───────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors duration-150 text-xs',
          open
            ? 'border-terminal-blue bg-terminal-blue/10 text-terminal-blue'
            : 'border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-terminal-blue',
        ].join(' ')}
        title="Changer de thème"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <>
          {/* Backdrop pour fermer au clic extérieur */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* ── Panel de sélection ───────────────────────────────── */}
          <div className="absolute right-0 top-full mt-2 z-50 w-72
                          bg-terminal-card border border-terminal-border
                          rounded-lg shadow-card animate-slide-in overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border">
              <span className="text-xs font-bold text-terminal-text uppercase tracking-widest">
                Design
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-terminal-muted hover:text-terminal-text transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Liste des thèmes */}
            <div className="p-3 flex flex-col gap-1.5">
              {THEMES.map(theme => {
                const isActive = currentTheme === theme.id
                return (
                  <button
                    key={theme.id}
                    onClick={() => { onThemeChange(theme.id); setOpen(false) }}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
                      'transition-all duration-150 text-left w-full',
                      isActive
                        ? 'border-terminal-green/50 bg-terminal-green/[0.06]'
                        : 'border-terminal-border/60 hover:border-terminal-border hover:bg-white/[0.025]',
                    ].join(' ')}
                  >
                    {/* Aperçu couleurs */}
                    <div
                      className="flex gap-px flex-shrink-0 rounded overflow-hidden"
                      style={{ boxShadow: '0 0 0 1px rgba(128,128,128,0.2)' }}
                    >
                      {/* Colonne BG */}
                      <div className="w-5 h-10" style={{ backgroundColor: theme.preview.bg }} />
                      {/* Colonne Card + Accent */}
                      <div className="w-5 h-10 flex flex-col">
                        <div className="flex-1" style={{ backgroundColor: theme.preview.card }} />
                        <div className="flex-1" style={{ backgroundColor: theme.preview.accent }} />
                      </div>
                    </div>

                    {/* Nom + description */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-bold tracking-wide"
                        style={{ color: theme.preview.accent }}
                      >
                        {theme.name}
                      </div>
                      <div className="text-[10px] text-terminal-muted leading-tight mt-0.5 truncate">
                        {theme.description}
                      </div>
                    </div>

                    {/* Indicateur actif */}
                    {isActive && (
                      <Check className="w-3.5 h-3.5 text-terminal-green flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-terminal-border text-[10px] text-terminal-muted text-center">
              Sauvegardé dans localStorage
            </div>
          </div>
        </>
      )}
    </div>
  )
}
