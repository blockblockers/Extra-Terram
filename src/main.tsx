// Extra Terram — src/main.tsx v0.8.0 — the sprite index (manifest and mounts) is fetched at boot, so menus know which art exists
// No React.StrictMode on purpose: its double-mounted effects would create two WebGL contexts
// on the one game canvas in development. The game shell owns the canvas lifecycle itself.
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { AuthProvider } from './net';
import { loadSpriteIndex } from './render/spriteIndex';
import '@fontsource/oxanium/latin-800.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles/index.css';

registerSW({ immediate: true });
void loadSpriteIndex();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
