// ════════════════════════════════════════════════════════════════
//  THEMES — Définitions des thèmes visuels du dashboard
//
//  Chaque thème correspond à un set de CSS custom properties
//  définies dans index.css via [data-theme="..."].
//  Le composant ThemeSwitcher applique le thème sur <html>.
// ════════════════════════════════════════════════════════════════

export type ThemeId = 'matrix' | 'cyberpunk' | 'midnight' | 'blood' | 'ghost'

export interface Theme {
  id: ThemeId
  name: string
  description: string
  // Couleurs hex pour l'aperçu dans le sélecteur (pas utilisées comme CSS)
  preview: {
    bg: string
    card: string
    accent: string
    text: string
  }
}

export const THEMES: Theme[] = [
  {
    id: 'matrix',
    name: 'MATRIX',
    description: 'Bloomberg Terminal — vert néon sur noir',
    preview: { bg: '#0a0e17', card: '#0d1321', accent: '#00ff88', text: '#cbd5e1' },
  },
  {
    id: 'cyberpunk',
    name: 'CYBERPUNK',
    description: 'Night City — rose / cyan sur violet profond',
    preview: { bg: '#0d0017', card: '#130022', accent: '#ff2d78', text: '#e0c8f5' },
  },
  {
    id: 'midnight',
    name: 'MIDNIGHT',
    description: 'Ocean Dark — or & bleu électrique sur navy',
    preview: { bg: '#050d1a', card: '#071428', accent: '#f0c040', text: '#c8ddf5' },
  },
  {
    id: 'blood',
    name: 'BLOOD MARKET',
    description: 'War Room — orange brûlé sur noir sang',
    preview: { bg: '#0c0808', card: '#110e0e', accent: '#ff6b2b', text: '#e8d8d8' },
  },
  {
    id: 'ghost',
    name: 'GHOST',
    description: 'Clean Light — indigo sur blanc glacé',
    preview: { bg: '#f0f4f8', card: '#ffffff', accent: '#6366f1', text: '#1e293b' },
  },
]

export const DEFAULT_THEME: ThemeId = 'matrix'
