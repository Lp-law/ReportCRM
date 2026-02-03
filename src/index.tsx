import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
// Debug: וידוא שהקובץ הראשי נטען כראוי
// eslint-disable-next-line no-console
console.log('Bootstrapping LP app, rootElement exists?', !!rootElement);
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);