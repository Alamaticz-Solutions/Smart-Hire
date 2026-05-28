import { Outlet, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { LayoutDashboard, Upload, MessageSquare, LogOut, Sun, Moon, Briefcase, Shield, Users, Download } from 'lucide-react'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'

export default function Layout({ user, onLogout, theme, toggleTheme }) {
    const [activities, setActivities] = useState([])

    const fetchActivities = async () => {
        try {
            const res = await axios.get('/api/activity')
            setActivities(res.data || [])
        } catch (e) {
            console.error("Failed to load activities", e)
        }
    }

    useEffect(() => {
        fetchActivities()
        const interval = setInterval(fetchActivities, 5000)
        return () => clearInterval(interval)
    }, [])

    const navItems = [
        { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
        { to: '/jobs', label: 'Job Description', Icon: Briefcase },
        { to: '/upload', label: 'Candidate Profiles', Icon: Users },
        { to: '/chat', label: 'Chat with Hire', Icon: MessageSquare },
    ]

    if (user?.role === 'admin') {
        navItems.push({ to: '/admin', label: 'Admin Portal', Icon: Shield })
    }



    return (
        <div className="app-shell">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    {/* Exact Alamaticz Solutions logo image */}
                    <img
                        src={alamaticzLogo}
                        alt="Alamaticz Solutions"
                        style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }}
                    />
                    <span className="sidebar-brand-name">Hire AI</span>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(({ to, label, Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                        >
                            <Icon size={18} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="logout-btn" onClick={onLogout}>
                        <LogOut size={15} />
                        LOGOUT
                    </button>
                </div>
            </aside>

            {/* Main */}
            <div className="main-content">
                <header className="topbar">
                    <span className="topbar-title">Alamaticz Solutions</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button 
                            onClick={toggleTheme} 
                            style={{ 
                                background: 'rgba(var(--gold-rgb), 0.15)', border: '1px solid var(--border-gold)', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', 
                                color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' 
                            }}
                            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <div className="profile-chip">
                            <div className="profile-avatar">
                                {(user?.full_name?.[0] || user?.name?.[0] || 'H').toUpperCase()}
                            </div>
                            <span className="profile-name">{user?.full_name || user?.name || 'HR User'}</span>
                        </div>
                    </div>
                </header>

                <div className="page-body" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Outlet />
                </div>
            </div>
            
            {/* Activity Log Sidebar (Right) */}
            <aside className="activity-sidebar" style={{
                width: '300px',
                borderLeft: '1px solid var(--border)',
                background: 'var(--sidebar-bg)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                height: '100%',
                backdropFilter: 'blur(25px)'
            }}>
                <div style={{
                    padding: '20px 16px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'rgba(var(--navy-dark-rgb), 0.4)'
                }}>
                    <h3 style={{
                        margin: 0,
                        color: 'var(--gold)',
                        fontFamily: 'var(--fh)',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span>⚡</span> Activity Feed
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-dim)', opacity: 0.8 }}>
                        Live updates from your team
                    </p>
                </div>
                
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    {activities.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--text-dim)',
                            opacity: 0.6,
                            padding: '2rem 0',
                            fontSize: '0.75rem'
                        }}>
                            No activity logged yet.
                        </div>
                    ) : (
                        activities.map(act => {
                            const initials = act.username ? act.username.substring(0, 2).toUpperCase() : 'U';
                            const date = new Date(act.timestamp);
                            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                            
                            return (
                                <div key={act.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                    <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #FB8500, #FFB703)',
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '0.72rem',
                                        flexShrink: 0,
                                        boxShadow: '0 0 8px rgba(251, 133, 0, 0.2)'
                                    }}>
                                        {initials}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: '1.35', wordBreak: 'break-word' }}>
                                            <strong style={{ color: 'var(--gold)' }}>{act.username}</strong>{' '}
                                            <span style={{ color: 'var(--text-dim)' }}>{act.action}</span>
                                        </div>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', opacity: 0.5 }}>
                                            {dateStr} at {timeStr}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </aside>
        </div>
    )
}
