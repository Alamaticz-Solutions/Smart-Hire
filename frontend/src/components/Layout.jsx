import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Upload, MessageSquare, LogOut, Sun, Moon, Briefcase, Shield } from 'lucide-react'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'

export default function Layout({ user, onLogout, theme, toggleTheme }) {
    const navItems = [
        { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
        { to: '/jobs', label: 'Job Description', Icon: Briefcase },
        { to: '/upload', label: 'Upload Resume', Icon: Upload },
        { to: '/chat', label: 'Chat with Hire', Icon: MessageSquare },
    ]

    // Add admin portal link if user is admin
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
                                {(user?.name?.[0] || 'H').toUpperCase()}
                            </div>
                            <span className="profile-name">{user?.name || 'HR User'}</span>
                        </div>
                    </div>
                </header>

                <div className="page-body" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Outlet />
                </div>
            </div>
        </div>
    )
}
