import { Outlet, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { LayoutDashboard, Upload, MessageSquare, LogOut, Sun, Moon, Briefcase, Shield, Users, Download, Activity, X } from 'lucide-react'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'

export default function Layout({ user, onLogout, theme, toggleTheme, onUpdateUser }) {
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showActivitySidebar, setShowActivitySidebar] = useState(false);
    const [activities, setActivities] = useState([]);
    const [loadingActivities, setLoadingActivities] = useState(false);

    useEffect(() => {
        axios.get('/api/auth/status')
            .then(res => {
                const updated = res.data;
                if (
                    updated.is_approved !== user?.is_approved ||
                    updated.is_admin !== user?.is_admin ||
                    updated.is_hr !== user?.is_hr ||
                    updated.is_external !== user?.is_external ||
                    updated.full_name !== user?.full_name ||
                    updated.role !== user?.role ||
                    updated.hidden_fields !== user?.hidden_fields
                ) {
                    onUpdateUser({
                        ...user,
                        ...updated,
                        role: updated.is_admin === 1 ? 'admin' : updated.role
                    });
                }
            })
            .catch(err => {
                console.error("Failed to check user status", err);
            });
    }, []);

    useEffect(() => {
        if (showActivitySidebar) {
            fetchActivities();
            const interval = setInterval(fetchActivities, 30000);
            return () => clearInterval(interval);
        }
    }, [showActivitySidebar]);

    const fetchActivities = async () => {
        setLoadingActivities(true);
        try {
            const res = await axios.get('/api/activity');
            setActivities(res.data || []);
        } catch (err) {
            console.error('Failed to fetch activities');
        } finally {
            setLoadingActivities(false);
        }
    };

    const navItems = [
        { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
        ...((user?.is_hr === 1 || user?.is_external === 1) ? [{ to: '/jobs', label: 'Job Description', Icon: Briefcase }] : []),
        { to: '/upload', label: 'Candidate Profiles', Icon: Users },
        { to: '/chat', label: 'Chat with Hire-Ai', Icon: MessageSquare },
    ]

    if (user?.role === 'admin' || user?.is_admin === 1) {
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
                        <div style={{ position: 'relative' }}>
                            <div 
                                className="profile-chip" 
                                title={user?.active_persona ? `Logged in as Admin, acting as ${user.active_persona}` : `Logged in as ${user.full_name}`}
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                style={{ cursor: 'pointer' }}
                            >
                            <div className="profile-avatar" style={{
                                background: user?.active_persona ? 'linear-gradient(135deg, #FB8500, #FFB703)' : 'var(--gold)',
                                boxShadow: user?.active_persona ? '0 0 10px rgba(251, 133, 0, 0.4)' : 'none',
                                transition: 'all 0.3s ease'
                            }}>
                                {(user?.active_persona?.[0] || user?.full_name?.[0] || 'H').toUpperCase()}
                            </div>
                            <span className="profile-name" style={{
                                fontWeight: user?.active_persona ? 'bold' : 'normal',
                                color: user?.active_persona ? 'var(--gold)' : 'var(--text)',
                                transition: 'all 0.3s ease'
                            }}>
                                {user?.active_persona ? `${user.active_persona} (Admin)` : (user?.full_name || 'HR User')}
                            </span>
                            </div>
                            
                            {/* Profile Dropdown */}
                            {showProfileMenu && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setShowProfileMenu(false)}></div>
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '200px',
                                        background: 'var(--navy-dark)', border: '1px solid var(--border)', borderRadius: '8px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 999, overflow: 'hidden'
                                    }}>
                                        {(user?.role === 'admin' || user?.is_admin === 1) && (
                                            <button 
                                                onClick={() => { setShowProfileMenu(false); setShowActivitySidebar(true); }}
                                                style={{
                                                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                                                    color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem',
                                                    display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Activity size={16} color="var(--gold)" />
                                                Activity Feed
                                            </button>
                                        )}
                                        <button 
                                            onClick={onLogout}
                                            style={{
                                                width: '100%', padding: '12px 16px', background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                                                color: '#fca5a5', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem',
                                                display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                            <LogOut size={16} />
                                            Logout
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <div className="page-body" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
                    {user?.is_approved !== 1 && (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            borderBottom: '1px solid #f59e0b',
                            color: '#fbbf24',
                            padding: '12px 24px',
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: '500'
                        }}>
                            <span>⚠️</span>
                            <span>
                                <strong>Access Pending:</strong> Your account is currently awaiting administrator approval. You can navigate the portal, but no candidate or job data will be visible.
                            </span>
                        </div>
                    )}
                    <Outlet context={{ user, onUpdateUser }} />
                </div>
                
                {/* Activity Feed Overlay Sidebar */}
                {showActivitySidebar && (
                    <>
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setShowActivitySidebar(false)}></div>
                        <div style={{
                            position: 'fixed', top: 0, right: 0, bottom: 0, width: '350px', maxWidth: '100vw',
                            background: 'var(--navy)', borderLeft: '1px solid var(--border)', zIndex: 1001,
                            display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 25px rgba(0,0,0,0.5)',
                            animation: 'slideInRight 0.3s ease forwards'
                        }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--navy-dark)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Activity size={20} color="var(--gold)" />
                                    <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Activity Feed</h3>
                                </div>
                                <button onClick={() => setShowActivitySidebar(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {loadingActivities && activities.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0' }}>Loading...</div>
                                ) : activities.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0', fontSize: '0.9rem' }}>No activity logged yet.</div>
                                ) : (
                                    activities.map(act => {
                                        const initials = act.username ? act.username.substring(0, 2).toUpperCase() : 'U';
                                        const date = new Date(act.timestamp);
                                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                                        return (
                                            <div key={act.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #FB8500, #FFB703)',
                                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0
                                                }}>
                                                    {initials}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                                                        <strong style={{ color: 'var(--gold)' }}>{act.username}</strong>{' '}
                                                        <span style={{ color: 'var(--text-dim)' }}>{act.action}</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--sky-dim)' }}>
                                                        {dateStr} at {timeStr}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <style>{`
                            @keyframes slideInRight {
                                from { transform: translateX(100%); }
                                to { transform: translateX(0); }
                            }
                        `}</style>
                    </>
                )}
            </div>
            
        </div>
    )
}
