// src/App.jsx
import React, { useState, useEffect } from 'react';
import ThemeToggle   from './components/ThemeToggle.jsx';
import GeofenceForm  from './components/GeofenceForm.jsx';
import PokemonFilter from './components/PokemonFilter.jsx';
import LogsPanel     from './components/LogsPanel.jsx';
import DiscordIdsForm from './components/DiscordIdsForm.jsx';
import ShutdownButton from './components/ShutdownButton.jsx';
import './components/styles/App.css';

export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('prefers-dark');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('prefers-dark', dark);
  }, [dark]);

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
          <DiscordIdsForm />
          <ShutdownButton />
        </aside>
        <section className="app-content">
          <LogsPanel />
        </section>
      </div>
    </div>
  );
}