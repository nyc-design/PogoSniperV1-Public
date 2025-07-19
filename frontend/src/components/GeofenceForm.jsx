// src/components/GeofenceForm.jsx

import React, { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../config';
import './styles/GeofenceForm.css'; // Import the new stylesheet

export default function GeofenceForm() {
  const [lat,     setLat]     = useState('');
  const [lng,     setLng]     = useState('');
  const [radius,  setRadius]  = useState('');
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  /* ------------------------------------------------------------------ */
  /* Load geofence from API (reusable for Retry)                        */
  /* ------------------------------------------------------------------ */
  const load = useCallback(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      setStatus(null);
      try {
        const r = await fetch(`${API_BASE}/api/geofence`);
        const d = await r.json().catch(() => ({}));
        if (!stop) {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          if (Array.isArray(d.center) && d.center.length === 2) {
            setLat(String(d.center[0] ?? ''));
            setLng(String(d.center[1] ?? ''));
          }
          if (typeof d.radius !== 'undefined') {
            setRadius(String(d.radius));
          }
        }
      } catch (err) {
        if (!stop) {
          console.error('[GeofenceForm] load error', err);
          setStatus(`Load failed: ${err.message || 'Failed to fetch'}`);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, []);

  // initial mount load
  useEffect(() => {
    return load();
  }, [load]);

  /* ------------------------------------------------------------------ */
  /* Validation helpers                                                  */
  /* ------------------------------------------------------------------ */
  function parseNum(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function validateInputs(latStr, lngStr, radStr) {
    const la = parseNum(latStr);
    const lo = parseNum(lngStr);
    const ra = parseNum(radStr);

    if (Number.isNaN(la) || la < -90 || la > 90) {
      return { ok: false, msg: 'Latitude must be a number between -90 and 90.' };
    }
    if (Number.isNaN(lo) || lo < -180 || lo > 180) {
      return { ok: false, msg: 'Longitude must be a number between -180 and 180.' };
    }
    if (Number.isNaN(ra) || ra < 0) {
      return { ok: false, msg: 'Radius must be a number ≥ 0.' };
    }
    return { ok: true, lat: la, lng: lo, radius: ra };
  }

  /* ------------------------------------------------------------------ */
  /* Save handler                                                        */
  /* ------------------------------------------------------------------ */
  async function save() {
    setSaving(true);
    setStatus(null);

    const v = validateInputs(lat, lng, radius);
    if (!v.ok) {
      setStatus(v.msg);
      setSaving(false);
      return;
    }

    try {
      const payload = { center: [v.lat, v.lng], radius: v.radius };
      const r = await fetch(`${API_BASE}/api/geofence`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        throw new Error(data.message || `HTTP ${r.status}`);
      }
      setStatus('Saved!');
    } catch (err) {
      console.error('[GeofenceForm] save error', err);
      setStatus(`Save failed: ${err.message || 'Failed to fetch'}`);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Quick-disable convenience                                           */
  /* ------------------------------------------------------------------ */
  async function disableFence() {
    // We can't await save() here because it uses the state which hasn't updated yet.
    // So we manually set radius to 0 and call save with it.
    setRadius('0');
    const v = validateInputs(lat, lng, '0');
    if (!v.ok) {
        setStatus("Cannot disable with invalid Lat/Lng.");
        return;
    }
    // Manually trigger save with the new radius
    save();
  }

  /* ------------------------------------------------------------------ */
  /* Header summary                                                     */
  /* ------------------------------------------------------------------ */
  const hasCoords = lat !== '' && lng !== '';
  const radiusNum = Number(radius);
  const fenceSummary = hasCoords ? (radiusNum > 0 ? `${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)} • ${radiusNum} km` : 'OFF') : '—';

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div className="card geofence-card">
      <div className="card-header-with-toggle" onClick={() => setCollapsed(c => !c)}>
        <button type="button" className="collapse-toggle">
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="card-title">Geofence</h3>
        <span className="gf-summary" title="Current center & radius">
          {fenceSummary}
        </span>
      </div>

      {!collapsed && (
        <>
          <div className="form-row">
            <label htmlFor="gf-lat">Lat</label>
            <input id="gf-lat" type="text" value={lat} onChange={e => setLat(e.target.value)} disabled={loading} />
          </div>

          <div className="form-row">
            <label htmlFor="gf-lng">Lng</label>
            <input id="gf-lng" type="text" value={lng} onChange={e => setLng(e.target.value)} disabled={loading} />
          </div>

          <div className="form-row">
            <label htmlFor="gf-radius">Radius (km)</label>
            <input id="gf-radius" type="number" value={radius} onChange={e => setRadius(e.target.value)} disabled={loading} min="0" step="0.1" />
          </div>

          <div className="geofence-actions">
            <button onClick={save} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save Geofence'}
            </button>
            <button type="button" className="btn-secondary" onClick={disableFence} disabled={saving || loading}>
              Disable
            </button>
          </div>

          {status && (
            <div className="form-status">
              {status}
              {status.startsWith('Load failed:') && (
                <button type="button" className="btn-inline" onClick={load} disabled={loading}>
                  Retry
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}