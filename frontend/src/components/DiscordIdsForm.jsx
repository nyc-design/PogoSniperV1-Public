// src/components/DiscordIdsForm.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../config';
import './styles/GeofenceForm.css'; // Reuse styles

export default function DiscordIdsForm() {
  const [serverId, setServerId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [botId, setBotId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/api/discord-ids`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Failed to fetch');
      setServerId(d.serverId || '');
      setChannelId(d.channelId || '');
      setBotId(d.botId || '');
    } catch (err) {
      setStatus(`Load failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = { serverId, channelId, botId };
      const r = await fetch(`${API_BASE}/api/discord-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.message || 'Save failed');
      setStatus('Saved! Restart the bot for changes to take effect.');
    } catch (err) {
      setStatus(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">Discord IDs</h3>
      <div className="form-row">
        <label htmlFor="discord-server">Target Server ID</label>
        <input id="discord-server" type="text" value={serverId} onChange={e => setServerId(e.target.value)} disabled={loading} />
      </div>
      <div className="form-row">
        <label htmlFor="discord-channel">Target Channel ID</label>
        <input id="discord-channel" type="text" value={channelId} onChange={e => setChannelId(e.target.value)} disabled={loading} />
      </div>
      <div className="form-row">
        <label htmlFor="discord-bot">Target Bot ID</label>
        <input id="discord-bot" type="text" value={botId} onChange={e => setBotId(e.target.value)} disabled={loading} />
      </div>
      <div className="form-actions">
        <button onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save IDs'}
        </button>
      </div>
      {status && <div className="form-status">{status}</div>}
    </div>
  );
}