// Extra Terram — src/main.tsx v0.7.0 — the title fonts (Oxanium, Rajdhani; latin only, bundled and precached)
// No React.StrictMode on purpose: its double-mounted effects would create two WebGL contexts
// on the one game canvas in development. The game shell owns the canvas lifecycle itself.
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { AuthProvider } from './net';
import '@fontsource/oxanium/latin-800.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles/index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
