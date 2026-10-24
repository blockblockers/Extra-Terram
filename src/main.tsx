// Extra Terram — src/main.tsx v0.6.0 — auth provider at the root
// No React.StrictMode on purpose: its double-mounted effects would create two WebGL contexts
// on the one game canvas in development. The game shell owns the canvas lifecycle itself.
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { AuthProvider } from './net';
import './styles/index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
