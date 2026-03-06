import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config';
import './styles/LocationQueueControl.css';

const EMPTY_QUEUE = { size: 0, maxSize: 0, newest: null, oldest: null };

export default function LocationQueueControl() {
  const [queue, setQueue] = useState(EMPTY_QUEUE);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/location-queue`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      setQueue({
        size: Number(data.size) || 0,
        maxSize: Number(data.maxSize) || 0,
        newest: data.newest || null,
        oldest: data.oldest || null
      });
    } catch (err) {
      if (!silent) setStatus(`Load failed: ${err.message || 'Failed to fetch queue.'}`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue(false);
    const id = setInterval(() => { loadQueue(true); }, 3000);
    return () => clearInterval(id);
  }, [loadQueue]);

  async function sendNext() {
    setSending(true);
    setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/api/location-queue/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        throw new Error(data.message || `HTTP ${r.status}`);
      }
      if (data.queue) {
        setQueue({
          size: Number(data.queue.size) || 0,
          maxSize: Number(data.queue.maxSize) || 0,
          newest: data.queue.newest || null,
          oldest: data.queue.oldest || null
        });
      } else {
        await loadQueue(true);
      }
      const sent = data.sent;
      setStatus(`Sent ${Number(sent.latitude).toFixed(5)}, ${Number(sent.longitude).toFixed(5)}.`);
    } catch (err) {
      setStatus(`Next failed: ${err.message || 'Unable to dispatch location.'}`);
      await loadQueue(true);
    } finally {
      setSending(false);
    }
  }

  const newest = queue.newest;
  const isEmpty = !queue.size;

  return (
    <div className="card location-queue-card">
      <h3 className="card-title">Location Queue</h3>
      <div className="queue-stat-row">
        <span>Queued</span>
        <strong>{queue.size}</strong>
      </div>
      <div className="queue-stat-row">
        <span>Max</span>
        <strong>{queue.maxSize || '-'}</strong>
      </div>

      <div className="queue-latest">
        <div className="queue-latest-title">Newest</div>
        {newest ? (
          <>
            <div className="queue-coords">{Number(newest.latitude).toFixed(5)}, {Number(newest.longitude).toFixed(5)}</div>
            {newest.name && <div className="queue-meta">{newest.name}</div>}
            {newest.queuedAt && <div className="queue-time">{new Date(newest.queuedAt).toLocaleTimeString()}</div>}
          </>
        ) : (
          <div className="queue-empty">No coordinates queued.</div>
        )}
      </div>

      <div className="queue-actions">
        <button onClick={sendNext} disabled={sending || loading || isEmpty}>
          {sending ? 'Sending...' : 'Next'}
        </button>
        <button onClick={() => loadQueue(false)} disabled={sending || loading} className="btn-secondary">
          Refresh
        </button>
      </div>

      {status && <div className="form-status">{status}</div>}
    </div>
  );
}
