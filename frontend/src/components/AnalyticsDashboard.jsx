// src/components/AnalyticsDashboard.js

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE_URL = 'http://localhost:4000'; // Or your API base

function AnalyticsDashboard() {
    const [stats, setStats] = useState({
        pokemonCounts: [],
        flagCounts: [],
        hourlyCounts: [],
    });

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/analytics`);
                const data = await res.json(); // Array of { timestamp, pokemon, flag }

                // Process data for charts
                const pokemonCounts = data.reduce((acc, { pokemon }) => {
                    acc[pokemon] = (acc[pokemon] || 0) + 1;
                    return acc;
                }, {});

                const flagCounts = data.reduce((acc, { flag }) => {
                    if (flag) acc[flag] = (acc[flag] || 0) + 1;
                    return acc;
                }, {});

                const hourlyCounts = data.reduce((acc, { timestamp }) => {
                    const hour = new Date(timestamp).getHours();
                    acc[hour] = (acc[hour] || 0) + 1;
                    return acc;
                }, {});

                // Format for Recharts
                const formattedPokemon = Object.entries(pokemonCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15); // Top 15

                const formattedFlags = Object.entries(flagCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15); // Top 15

                const formattedHourly = Array.from({ length: 24 }, (_, i) => ({
                    hour: `${i}:00`,
                    count: hourlyCounts[i] || 0,
                }));
                
                setStats({ 
                    pokemonCounts: formattedPokemon, 
                    flagCounts: formattedFlags,
                    hourlyCounts: formattedHourly 
                });

            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            }
        };

        fetchAnalytics();
    }, []);

    return (
        <div>
            <h2>Analytics Dashboard</h2>

            <h3>Top Pokémon Alerts</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.pokemonCounts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
            </ResponsiveContainer>

            <h3>Alerts by Hour (UTC)</h3>
             <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.hourlyCounts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#82ca9d" />
                </LineChart>
            </ResponsiveContainer>

            <h3>Top Countries</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.flagCounts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#ffc658" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default AnalyticsDashboard;