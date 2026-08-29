import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, Suspense, lazy } from 'react'
import axios from 'axios'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'

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

    // S2.9: theme is 'light' | 'dark' | 'system' - 'system' defers to
    // prefers-color-scheme rather than hardcoding 'light' for a viewer who
    // never touched the toggle. `theme` (the raw preference, including
    // 'system') is what's persisted and what the picker highlights;
    // `resolvedTheme` (always 'light' or 'dark') is what's actually painted.
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('hire_ai_theme') || 'system'
    })
    const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
        window.matchMedia('(prefers-color-scheme: dark)').matches
    )
    const resolvedTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = (e) => setSystemPrefersDark(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', resolvedTheme)
        localStorage.setItem('hire_ai_theme', theme)
    }, [theme, resolvedTheme])

    useEffect(() => {
        // The backend derives the trusted identity from a signed session
        // token (see main.py's verify_session_middleware) rather than
        // trusting a client-supplied username directly. `x-acting-as`
        // carries the admin "acting as persona" selection (AdminPage.jsx);
        // the backend only honors it when the signed-in user is admin/hr.
        if (user && user.token) {
            axios.defaults.headers.common['x-session-token'] = user.token
            if (user.active_persona) {
                axios.defaults.headers.common['x-acting-as'] = user.active_persona
            } else {
                delete axios.defaults.headers.common['x-acting-as']
            }
        } else {
            delete axios.defaults.headers.common['x-session-token']
            delete axios.defaults.headers.common['x-acting-as']
        }
    }, [user])


    const login = (u) => { setUser(u); localStorage.setItem('hire_ai_user', JSON.stringify(u)) }
    // G-24: candidate/job data cached in sessionStorage (cached_candidates,
    // cached_jobs, cached_selected_job, cached_job_candidates_*) and this
    // user's chat history in localStorage had no cleanup on logout - on a
    // shared machine, the next person to sign in in the same tab could see
    // the previous user's cached PII for a moment before a fresh fetch
    // overwrote it. Logout now clears both.
    const logout = () => {
        if (user?.username) localStorage.removeItem(`hire_ai_chat_msgs_${user.username}`)
        sessionStorage.clear()
        setUser(null)
        localStorage.removeItem('hire_ai_user')
    }
    const updateUser = (u) => { setUser(u); localStorage.setItem('hire_ai_user', JSON.stringify(u)) }

    return (
        <BrowserRouter>
            <ErrorBoundary>
            <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                    <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={login} />} />
                    <Route element={user ? <Layout user={user} onLogout={logout} theme={theme} resolvedTheme={resolvedTheme} setTheme={setTheme} onUpdateUser={updateUser} /> : <Navigate to="/login" />}>
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
            </ErrorBoundary>
        </BrowserRouter>
    )
}
