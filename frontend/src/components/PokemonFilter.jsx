// src/components/PokemonFilter.jsx

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { API_BASE } from '../config';
import './styles/PokemonFilter.css'; // Correct path based on your file tree

export default function PokemonFilter() {
    const [allPokemon, setAllPokemon] = useState({});
    const [idByName, setIdByName] = useState({});
    const [selectedPokemon, setSelectedPokemon] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGen, setActiveGen] = useState('All');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setStatus('');
        try {
            const res = await fetch(`${API_BASE}/api/pokemon?group=gen`);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            if (!data.gens) throw new Error("Invalid data format from API");
            setAllPokemon(data.gens);

            // Fetch id mapping once to render sprites
            const dexRes = await fetch(`${API_BASE}/api/pokedex`);
            if (dexRes.ok) {
                const full = await dexRes.json();
                const map = Object.fromEntries(full.map(x => [x.name, x.id]));
                setIdByName(map);
            }

            const filterRes = await fetch(`${API_BASE}/api/filter/pokemon`);
            if (!filterRes.ok) throw new Error(`HTTP error ${filterRes.status}`);
            const selected = await filterRes.json();
            setSelectedPokemon(new Set(selected));
        } catch (err) {
            console.error("Load failed:", err);
            setStatus(`Load failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const flatPokemonList = useMemo(() => Object.values(allPokemon).flat(), [allPokemon]);

    const getVisiblePokemon = () => {
        const list = (activeGen === 'All') ? flatPokemonList : (allPokemon[activeGen] || []);
        if (!searchTerm.trim()) return list;
        return list.filter(p => p.toLowerCase().includes(searchTerm.trim().toLowerCase()));
    };
    
    const visiblePokemon = getVisiblePokemon();
    
    const handleToggle = (pokemonName) => {
        setSelectedPokemon(prev => {
            const next = new Set(prev);
            if (next.has(pokemonName)) next.delete(pokemonName);
            else next.add(pokemonName);
            return next;
        });
    };
    
    const handleSave = async () => {
        setSaving(true);
        setStatus('');
        try {
            const res = await fetch(`${API_BASE}/api/filter/pokemon`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Array.from(selectedPokemon))
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Save failed');
            setStatus('Filter saved!');
        } catch (err) {
            console.error("Save failed:", err);
            setStatus(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const clearAll = () => setSelectedPokemon(new Set());
    const selectVisible = () => setSelectedPokemon(prev => new Set([...prev, ...visiblePokemon]));

    return (
        <div className="card pokemon-filter-card">
            <h3 className="card-title">Pokémon Filter</h3>
            <div className="filter-actions">
                <button onClick={handleSave} disabled={saving || loading}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={clearAll} className="btn-secondary">Clear All ({selectedPokemon.size})</button>
            </div>
            <div className="gen-tabs">
                <button onClick={() => setActiveGen('All')} className={activeGen === 'All' ? 'active' : ''}>All ({flatPokemonList.length})</button>
                {Object.keys(allPokemon).sort((a,b)=>Number(a)-Number(b)).map(gen => (
                    <button key={gen} onClick={() => setActiveGen(gen)} className={activeGen === gen ? 'active' : ''}>
                        Gen {gen} ({allPokemon[gen]?.length || 0})
                    </button>
                ))}
            </div>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} disabled={loading} />
            <div className="filter-actions">
                <button onClick={selectVisible} className="btn-secondary">Select Visible</button>
            </div>
            {status && <div className="form-status">{status}</div>}
            <div className="pokemon-list">
                {loading ? <p>Loading...</p> : visiblePokemon.map(p => {
                    const id = idByName[p];
                    const img = id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png` : null;
                    return (
                        <div key={p} className="pokemon-item">
                            {img && <img className="pk-sprite" src={img} alt="" width={24} height={24} loading="lazy" decoding="async" />}
                            <input id={`cb-${p}`} type="checkbox" checked={selectedPokemon.has(p)} onChange={() => handleToggle(p)} />
                            <label htmlFor={`cb-${p}`}>{p}</label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
