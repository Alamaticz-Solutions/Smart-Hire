import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, Suspense, lazy } from 'react'
import axios from 'axios'
import Layout from './components/Layout'

// Route-based code splitting: these used to be static imports, so every
// page's JS (JobsPage/UploadPage alone are still large even after being
// split into sub-components) shipped in the single initial bundle
// regardless of which route the user actually opened first. Vite's build
// already flags a single ~2.2MB chunk over its recommended size -- lazy()
// gives each page its own chunk, fetched only when its route is visited.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const JobsPage = lazy(() => import('./pages/JobsPage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const ConnectPage = lazy(() => import('./pages/ConnectPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))

// Minimal fallback shown only for the brief moment a route's chunk is
// downloading (typically imperceptible on repeat visits once cached).
function RouteLoadingFallback() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-dim, #888)' }}>
            Loading...
        </div>
    )
}

export default function App() {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('hire_ai_user')) || null
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
            axios.defaults.headers.common['x-user-username'] = user.active_persona || user.username
        } else {
            delete axios.defaults.headers.common['x-user-username']
        }
    }, [user])

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

    const login = (u) => { setUser(u); localStorage.setItem('hire_ai_user', JSON.stringify(u)) }
    const logout = () => { setUser(null); localStorage.removeItem('hire_ai_user') }
    const updateUser = (u) => { setUser(u); localStorage.setItem('hire_ai_user', JSON.stringify(u)) }

    return (
        <BrowserRouter>
            <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                    <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={login} />} />
                    <Route element={user ? <Layout user={user} onLogout={logout} theme={theme} toggleTheme={toggleTheme} onUpdateUser={updateUser} /> : <Navigate to="/login" />}>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/jobs" element={(user?.is_hr === 1 || user?.is_external === 1) ? <JobsPage /> : <Navigate to="/" />} />
                        <Route path="/upload" element={<UploadPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="/admin" element={(user?.is_admin === 1 || user?.role === 'admin') && user?.is_external !== 1 ? <AdminPage /> : <Navigate to="/" />} />
                        <Route path="/connect" element={(user?.is_admin === 1 || user?.role === 'admin') && user?.is_external !== 1 ? <ConnectPage /> : <Navigate to="/" />} />
                        <Route path="/templates" element={(user?.is_admin === 1 || user?.role === 'admin') && user?.is_external !== 1 ? <TemplatesPage /> : <Navigate to="/" />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}
