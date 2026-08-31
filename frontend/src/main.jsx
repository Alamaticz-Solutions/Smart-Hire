import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import axios from 'axios'

axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';

// Pre-paint the theme + accent attributes from localStorage so the first
// frame already matches the user's choice (App.jsx's effects would otherwise
// run a tick later, flashing the default palette). Mirrors App.jsx's
// resolution: theme 'system' -> prefers-color-scheme; accent default 'amber'.
try {
    const storedTheme = localStorage.getItem('hire_ai_theme') || 'system';
    const resolved = storedTheme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : storedTheme;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-accent', localStorage.getItem('hire_ai_accent') || 'amber');
} catch { /* private-mode / storage disabled — App.jsx effects still set these */ }

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
