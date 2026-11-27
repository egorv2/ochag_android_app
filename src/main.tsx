import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(<App />);

// В dev service worker не регистрируем, чтобы HMR всегда отдавал свежий код.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
