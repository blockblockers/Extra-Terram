// Extra Terram — tailwind.config.js v0.1.0 — Phase 1 scaffold
// Safe-area tokens are first-class spacing values from day one (Deadblock lesson):
// full-bleed backgrounds are never inset; HUD/bars use pt-safe-top / pb-safe-bottom etc.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        'safe-top': 'var(--safe-top)',
        'safe-bottom': 'var(--safe-bottom)',
        'safe-left': 'var(--safe-left)',
        'safe-right': 'var(--safe-right)',
      },
      colors: {
        grove: {
          950: '#06100b',
          900: '#0b1a12',
          800: '#12261a',
          700: '#1c3a27',
          500: '#3f8f3a',
          300: '#7fd36b',
        },
        sap: '#e8c33a',
        rust: '#c47a1e',
      },
      fontFamily: {
        ui: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
