// src/index.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- CORRECTED PATHS ---
import './components/styles/reset.css';
import './components/styles/variables.css';
import './components/styles/main.css';
// -----------------------

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);