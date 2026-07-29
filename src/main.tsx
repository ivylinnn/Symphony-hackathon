import { createRoot } from 'react-dom/client';

import CanvasPage from './pages/canvas';
import './styles.css';

/**
 * Standalone demo entry.
 *
 * Renders the real `CanvasPage` full-screen. Every internal dependency the feature
 * expects (platform APIs, router, icon set, design tokens) is provided by the stubs
 * wired up in `vite.config.ts` and `tailwind.config.cjs` — the feature source itself
 * is untouched.
 */
function DemoBadge() {
  return (
    <div className="pointer-events-none fixed left-16 top-4 z-40 flex items-center gap-2 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface/90 px-3 py-1.5 text-[11px] font-medium text-neutral-mediumOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.12)] backdrop-blur">
      <span className="inline-block size-1.5 rounded-full bg-success-fill" />
      Symphony Canvas · live UI demo — backend mocked
    </div>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <>
    <CanvasPage />
    <DemoBadge />
  </>
);
