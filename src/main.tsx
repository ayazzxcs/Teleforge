import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (typeof window !== 'undefined') {
  const origAlert = window.alert;
  window.alert = (msg?: any) => {
    if (typeof msg === 'string' && msg.includes('Missing MTProto Entity')) {
      console.warn('[GramJS Suppressed Alert]:', msg);
      return;
    }
    if (origAlert) origAlert.call(window, msg);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

