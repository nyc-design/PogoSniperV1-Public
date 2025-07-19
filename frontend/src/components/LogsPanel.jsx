// src/components/LogsPanel.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';
import './styles/LogsPanel.css';

export default function LogsPanel() {
  const [logs, setLogs] = useState([]);
  const [serverIsDown, setServerIsDown] = useState(false); // NEW: State to track server status
  const logsEndRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setLogs(data);
      if (serverIsDown) setServerIsDown(false); // Server is back online
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      if (!serverIsDown) setServerIsDown(true); // Server is now offline
    }
  }, [serverIsDown]); // Dependency array includes serverIsDown

  useEffect(() => {
    fetchLogs(); // Initial fetch
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const parseLogLine = (line) => {
    const match = line.match(/\[(\w+)\]/);
    const severity = match ? match[1] : 'INFO';
    const message = line.substring(line.indexOf(']') + 1).trim();
    return { severity, message };
  };

  return (
    <div className="card logs-panel-card">
      <div className="logs-header">
        <h3 className="card-title">Logs</h3>
        <button onClick={fetchLogs} className="btn-secondary">Refresh</button>
      </div>
      
      {/* NEW: Display a helpful message when the server is down */}
      {serverIsDown && (
        <div className="server-down-message">
          Server is offline. Logs will resume when it's back.
        </div>
      )}

      <div className="logs-view">
        {logs.map((line, index) => {
          const { severity, message } = parseLogLine(line);
          return (
            <div key={index} className={`log-line ${severity}`}>
              <span className="sev">{severity}</span>
              <span>{message}</span>
            </div>
          );
        })}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}