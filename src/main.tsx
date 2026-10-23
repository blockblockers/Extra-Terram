// Extra Terram — src/main.tsx v0.1.0 — Phase 1 scaffold
// No React.StrictMode on purpose: its double-mounted effects would create two WebGL contexts
// on the one game canvas in development. The game shell owns the canvas lifecycle itself.
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
