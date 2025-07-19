// src/App.jsx

import React, { useState, useEffect } from 'react';
import ThemeToggle   from './components/ThemeToggle.jsx';
import GeofenceForm  from './components/GeofenceForm.jsx';
import PokemonFilter from './components/PokemonFilter.jsx';
import LogsPanel     from './components/LogsPanel.jsx';
import ShutdownButton from './components/ShutdownButton.jsx'; // <-- Import the new component

import './components/styles/App.css';

export default function App() {
  const [dark, setDark] = useState(/* ... */);
  useEffect(() => { /* ... */ }, [dark]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Pogo Reveal Dashboard</h1>
        <ThemeToggle dark={dark} setDark={setDark} />
      </header>
      <div className="app-main">
        <aside className="app-sidebar">
          <PokemonFilter />
          <GeofenceForm />
          <ShutdownButton /> {/* <-- Add the button at the end of the sidebar */}
        </aside>
        <section className="app-content">
          <LogsPanel />
        </section>
      </div>
    </div>
  );
}