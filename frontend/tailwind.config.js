/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Police monospace en priorité JetBrains Mono (chargée via Google Fonts)
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        // Palette "Terminal Financier / Bloomberg Dark"
        terminal: {
          bg:     '#0a0e17',   // Fond principal — noir quasi-pur
          card:   '#0d1321',   // Fond des cartes/panneaux — légèrement plus clair
          border: '#1a2540',   // Bordures — bleu nuit discret
          green:  '#00ff88',   // Vert néon — profits, succès, live
          red:    '#ff4455',   // Rouge vif — pertes, erreurs
          yellow: '#ffd700',   // Or — prix, avertissements
          blue:   '#38bdf8',   // Bleu clair — métriques neutres
          purple: '#a78bfa',   // Violet — identifiants, adresses
          muted:  '#4a5568',   // Texte secondaire grisé
          text:   '#cbd5e1',   // Texte principal — gris clair lisible
        },
      },
      animation: {
        'blink':       'blink 1s step-end infinite',
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':        'glow 2s ease-in-out infinite',
        'slide-in':    'slideIn 0.3s ease-out',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        glow: {
          '0%, 100%': { textShadow: '0 0 8px rgba(0,255,136,0.8)' },
          '50%':      { textShadow: '0 0 20px rgba(0,255,136,1), 0 0 40px rgba(0,255,136,0.5)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'green-glow': '0 0 15px rgba(0, 255, 136, 0.2)',
        'card':       '0 0 0 1px rgba(26, 37, 64, 0.8)',
      },
    },
  },
  plugins: [],
}
