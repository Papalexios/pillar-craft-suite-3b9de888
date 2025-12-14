import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import App, { SotaErrorBoundary } from './App';
import '../index.css';

// SOTA FIX: Polyfill Buffer and Global for Browser Compatibility
// @ts-ignore
(window as any).Buffer = Buffer;
// @ts-ignore
(window as any).global = window;

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <SotaErrorBoundary>
            <App />
        </SotaErrorBoundary>
    );
}
