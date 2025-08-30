// src/components/LogsPanel.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pause, Play, RefreshCcw, Copy } from 'lucide-react';
import { API_BASE } from '../config';
import './styles/LogsPanel.css';
// We will put the styles in a global file, so no new import is needed here.

export default function LogsPanel() {
  const [logs, setLogs] = useState([]);
  const [serverIsDown, setServerIsDown] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const allSeverities = ['INFO', 'SUCCESS', 'ACTION', 'WARN', 'ERROR'];
  const [filters, setFilters] = useState(() => new Set(allSeverities));
  const logsEndRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setLogs(data);
      if (serverIsDown) setServerIsDown(false);
    } catch (err) {
      // console.error('Failed to fetch logs:', err); // This can be noisy
      if (!serverIsDown) setServerIsDown(true);
    }
  }, [serverIsDown]);

  useEffect(() => {
    if (paused) return;
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs, paused]);

  useEffect(() => {
    if (autoScroll) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  // --- THIS IS THE KEY LOGIC ---
  const parseLogLine = (line) => {
    const known = ['ERROR','WARN','SUCCESS','ACTION','INFO'];
    const tags = Array.from(line.matchAll(/\[([A-Za-z]+)\]/g)).map(m => m[1].toUpperCase());
    const uniqTags = Array.from(new Set(tags.filter(t => known.includes(t))));
    let severity = 'INFO';
    if (uniqTags.includes('ERROR')) severity = 'ERROR';
    else if (uniqTags.includes('WARN')) severity = 'WARN';
    else if (uniqTags.includes('SUCCESS')) severity = 'SUCCESS';
    else if (uniqTags.includes('ACTION')) severity = 'ACTION';
    else if (uniqTags.includes('INFO')) severity = 'INFO';

    // Strip all bracketed tags and leading timestamp
    let message = line.replace(/\[[A-Za-z]+\]/g, '').trim();
    message = message.replace(/\[PK:\d{1,4}\]/g, '').trim();
    message = message.replace(/^\d{4}-\d{2}-\d{2}T[^ ]+\s*/, '');
    // Detect optional sprite id tag [PK:123]
    const pkMatch = line.match(/\[PK:(\d{1,4})\]/);
    const spriteId = pkMatch ? Number(pkMatch[1]) : null;
    return { severity, message, tags: uniqTags, spriteId };
  };
  // -----------------------------

  const visibleEntries = logs
    .map(parseLogLine)
    .filter(({ severity }) => filters.has(severity));

  function toggleSeverity(sev) {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev); else next.add(sev);
      // avoid empty set – if user removed last, re-enable all
      if (next.size === 0) return new Set(allSeverities);
      return next;
    });
  }

  function selectAll() { setFilters(new Set(allSeverities)); }
  function selectNone() { setFilters(new Set()); }

  async function copyVisible() {
    try {
      const text = visibleEntries.map(e => `[${e.severity}] ${e.message}`).join('\n');
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // best-effort copy
    }
  }

  return (
    <div className="card logs-panel-card">
      <div className="logs-header">
        <h3 className="card-title">Logs</h3>
        <div className="logs-toolbar">
          <button onClick={fetchLogs} className="btn-secondary" title="Refresh now">
            <RefreshCcw size={16} /> Refresh
          </button>
          <button onClick={() => setPaused(p => !p)} className="btn-ghost" title={paused ? 'Resume auto-fetch' : 'Pause auto-fetch'}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={() => setAutoScroll(v => !v)} className="btn-ghost" title="Toggle auto-scroll">
            {autoScroll ? 'Auto-scroll On' : 'Auto-scroll Off'}
          </button>
          <button onClick={copyVisible} className="btn-ghost" title="Copy visible logs">
            <Copy size={16} /> Copy
          </button>
        </div>
      </div>

      <div className="logs-controls">
        {allSeverities.map(sev => (
          <button
            key={sev}
            className={`chip ${sev} ${filters.has(sev) ? 'active' : ''}`}
            onClick={() => toggleSeverity(sev)}
          >
            {sev}
          </button>
        ))}
        <button className="chip" onClick={selectAll}>All</button>
        <button className="chip" onClick={selectNone}>None</button>
      </div>
      
      {serverIsDown && (
        <div className="server-down-message">
          Server is offline. Logs will resume when it's back.
        </div>
      )}

      <div className="logs-view">
        {visibleEntries.map(({ severity, message, tags, spriteId }, index) => (
          <div key={index} className={`log-line ${severity}`}>
            <span className="sev-group">
              {(tags?.length ? tags : [severity]).map((t, i) => (
                <span key={i} className={`sev ${t}`}>{t}</span>
              ))}
            </span>
            {spriteId && (
              <img
                className="log-sprite"
                src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${spriteId}.png`}
                alt="pk"
              />
            )}
            <span>{message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
