// src/components/ShutdownButton.jsx

import React, { useState } from 'react';
import { API_BASE } from '../config';
import './styles/ShutdownButton.css';

export default function ShutdownButton() {
    const [shuttingDown, setShuttingDown] = useState(false);

    const handleShutdown = async () => {
        // A confirmation dialog is crucial to prevent accidental shutdowns
        if (window.confirm('Are you sure you want to shut down the bot server?')) {
            setShuttingDown(true);
            try {
                await fetch(`${API_BASE}/api/shutdown`, { method: 'POST' });
                // The server will shut down, so this component will show a "Shutting down..." message
            } catch (error) {
                // This will likely fail because the server dies before sending a response, which is okay.
                console.log("Shutdown command sent. The server is likely offline.");
            }
        }
    };

    return (
        <div className="card shutdown-card">
            <button 
                className="shutdown-button" 
                onClick={handleShutdown} 
                disabled={shuttingDown}
            >
                {shuttingDown ? 'Shutting Down...' : 'Shutdown Bot Server'}
            </button>
        </div>
    );
}