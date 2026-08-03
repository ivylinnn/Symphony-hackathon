import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import CanvasPage from './pages/canvas';
import HomePage from './pages/home';
import './styles.css';

/**
 * Standalone demo entry.
 *
 * Hash 路由：`#/` 是 Symphony 首页，`#/canvas` 是画布页。
 * 画布内部的依赖（平台 API、路由、图标、设计 token）由 vite.config.ts 里的 stubs 提供。
 */
const getRoute = () => (window.location.hash.startsWith('#/canvas') ? 'canvas' : 'home');

function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route === 'canvas') {
    return <CanvasPage />;
  }
  return <HomePage />;
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(<App />);
