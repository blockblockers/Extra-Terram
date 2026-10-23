// Extra Terram — tailwind.config.js v0.3.0 — palette matched to the concept art (deep teal-navy frame, moss, sap gold)
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
        // The chrome is the art pack's dark teal-navy; the greens and gold are the Rootkin palette.
        grove: {
          950: '#07131a',
          900: '#0b1c22',
          800: '#122a2f',
          700: '#1b3d3e',
          500: '#3f8f3a',
          300: '#7fd36b',
        },
        sap: '#e8c33a',
        rust: '#c47a1e',
        cyanglow: '#4fd8e8',
      },
      fontFamily: {
        ui: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
