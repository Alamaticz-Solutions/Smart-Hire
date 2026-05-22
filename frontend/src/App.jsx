import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import UploadPage from './pages/UploadPage'
import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import Layout from './components/Layout'

export default function App() {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('hire_ai_user')) || null
        } catch { return null }
    })

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('hire_ai_theme') || 'light'
    })

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('hire_ai_theme', theme)
    }, [theme])

    useEffect(() => {
        if (user && user.username) {
            axios.defaults.headers.common['x-user-username'] = user.username
        } else {
            delete axios.defaults.headers.common['x-user-username']
        }
    }, [user])

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

    const login = (u) => { setUser(u); sessionStorage.setItem('hire_ai_user', JSON.stringify(u)) }
    const logout = () => { setUser(null); sessionStorage.removeItem('hire_ai_user') }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={login} />} />
                <Route element={user ? <Layout user={user} onLogout={logout} theme={theme} toggleTheme={toggleTheme} /> : <Navigate to="/login" />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/admin" element={user?.role === 'admin' ? <AdminPage /> : <Navigate to="/" />} />
                </Route>
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </BrowserRouter>
    )
}
