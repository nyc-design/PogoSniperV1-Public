// src/components/LogsPanel.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';
import './styles/LogsPanel.css';
// We will put the styles in a global file, so no new import is needed here.

export default function LogsPanel() {
  const [logs, setLogs] = useState([]);
  const [serverIsDown, setServerIsDown] = useState(false);
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
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- THIS IS THE KEY LOGIC ---
  const parseLogLine = (line) => {
    const match = line.match(/\[(\w+)\]/);
    if (match) {
      const severity = match[1].trim().toUpperCase();
      const message = line.substring(line.indexOf(']') + 1).trim();
      return { severity, message };
    }
    return { severity: 'INFO', message: line };
  };
  // -----------------------------

  return (
    <div className="card logs-panel-card">
      <div className="logs-header">
        <h3 className="card-title">Logs</h3>
        <button onClick={fetchLogs} className="btn-secondary">Refresh</button>
      </div>
      
      {serverIsDown && (
        <div className="server-down-message">
          Server is offline. Logs will resume when it's back.
        </div>
      )}

      <div className="logs-view">
        {logs.map((line, index) => {
          const { severity, message } = parseLogLine(line);
          // The severity is now applied as a class name to the div
          return (
            <div key={index} className={`log-line ${severity}`}>
              <span className="sev">[{severity}]</span>
              <span>{message}</span>
            </div>
          );
        })}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}