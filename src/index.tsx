import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import App, { SotaErrorBoundary } from './App';
import './index.css';

// SOTA FIX: Polyfill Buffer and Global for Browser Compatibility
(window as any).Buffer = Buffer;
(window as any).global = window;

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <SotaErrorBoundary>
        <App />
      </SotaErrorBoundary>
    </React.StrictMode>
  );
}
