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
        // Palette thémable via CSS custom properties (RGB triplets)
        // <alpha-value> est remplacé par Tailwind pour les modificateurs /10, /50, etc.
        // ex: bg-terminal-green/10 → rgb(var(--c-accent) / 0.1)
        terminal: {
          bg:     'rgb(var(--c-bg)     / <alpha-value>)',
          card:   'rgb(var(--c-card)   / <alpha-value>)',
          border: 'rgb(var(--c-border) / <alpha-value>)',
          green:  'rgb(var(--c-accent) / <alpha-value>)',
          red:    'rgb(var(--c-red)    / <alpha-value>)',
          yellow: 'rgb(var(--c-yellow) / <alpha-value>)',
          blue:   'rgb(var(--c-blue)   / <alpha-value>)',
          purple: 'rgb(var(--c-purple) / <alpha-value>)',
          muted:  'rgb(var(--c-muted)  / <alpha-value>)',
          text:   'rgb(var(--c-text)   / <alpha-value>)',
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
          '0%, 100%': { textShadow: '0 0 8px rgb(var(--c-accent) / 0.8)' },
          '50%':      { textShadow: '0 0 20px rgb(var(--c-accent) / 1), 0 0 40px rgb(var(--c-accent) / 0.5)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'green-glow': '0 0 15px rgb(var(--c-accent) / 0.2)',
        'card':       '0 0 0 1px rgb(var(--c-border) / 0.8)',
      },
    },
  },
  plugins: [],
}
