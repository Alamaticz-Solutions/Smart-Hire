import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { LayoutDashboard, Upload, MessageSquare, LogOut, Sun, Moon, Monitor, Briefcase, Shield, Users, Download, Activity, X, Link, FileText, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import alamaticzMark from '../assets/alamaticz-mark.png'
import { useModalA11y } from '../hooks/useModalA11y'
import { usePageTitle } from '../hooks/usePageTitle'

// Ref S2.1/G-26: the topbar used to show the company name on every screen
// ("Alamaticz Solutions", repeated below the sidebar's own brand mark) with
// no page title at all - so the user never saw where they were. Nav labels
// here match the renamed items from G-26 (Job Description -> Jobs, etc.)
//
// The icon+title+subtitle used to be duplicated a second time in the page
// body on Admin/Connect/Templates (and only those three - the rest of the
// app never had one), which is what actually read as "messy, different
// font sizes, header too big": that per-page heading was a completely
// unstyled <h1> with no relation to the app's type scale. It now lives
// once, here, so every route gets the same real heading treatment instead
// of three different ad hoc ones.
const PAGE_META = {
    '/': { title: 'Dashboard', subtitle: 'Overview of your recruiting pipeline and candidate insights.' },
    '/jobs': { title: 'Jobs', subtitle: 'Track open roles and their candidate funnel status.' },
    '/upload': { title: 'Candidates', subtitle: 'Upload resumes and manage your candidate database.' },
    '/chat': { title: 'Assistant', subtitle: 'Ask questions about your candidates in natural language.' },
    '/connect': { title: 'Integrations', subtitle: 'Connect mailboxes and Drive storage.' },
    '/templates': { title: 'Email Templates', subtitle: 'Draft automated email responses sent to candidates.' },
    '/admin': { title: 'Administration', subtitle: 'Manage system changes, user roles, and access control.' },
}
const PAGE_TITLES = Object.fromEntries(Object.entries(PAGE_META).map(([path, { title }]) => [path, title]))

const THEME_OPTIONS = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'Match system', Icon: Monitor },
]

// Accent hue picker — swatch colours are the dark-theme --action value for
// each hue (see the data-accent blocks in index.css). amber is the default.
const ACCENTS = [
    { value: 'amber', label: 'Amber', swatch: '#E9A93F' },
    { value: 'violet', label: 'Violet', swatch: '#8B8BF5' },
    { value: 'teal', label: 'Teal', swatch: '#4FC7C7' },
]

export default function Layout({ user, onLogout, theme, resolvedTheme, setTheme, accent, onChangeAccent, onUpdateUser }) {
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const profileMenuRef = useModalA11y(showProfileMenu, () => setShowProfileMenu(false));
    const [showActivitySidebar, setShowActivitySidebar] = useState(false);
    const activityDrawerRef = useModalA11y(showActivitySidebar, () => setShowActivitySidebar(false));
    const [activities, setActivities] = useState([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [activitiesError, setActivitiesError] = useState(false);
    // S2.5: was permanently visible with no way to acknowledge it. Dismissing
    // only hides it for this tab session (not permanently) - the pending
    // state is still real and every screen still shows no data underneath,
    // so it should come back on the next login/reload rather than be
    // silence-able forever.
    const [pendingBannerDismissed, setPendingBannerDismissed] = useState(() => sessionStorage.getItem('hire_ai_pending_banner_dismissed') === '1');
    // S2.2: fixed 240px sidebar with no collapse control, on a product whose
    // main content is routinely a 2600px-wide table. A rail (72px, icon-only)
    // gives that width back; persisted so it doesn't reset per navigation.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('hire_ai_sidebar_collapsed') === '1');
    useEffect(() => {
        localStorage.setItem('hire_ai_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    }, [sidebarCollapsed]);

    // G-15: the 240px sidebar never gave any width back below desktop, and
    // at phone width it ate ~61% of the viewport with no way to dismiss it.
    // isTabletWidth auto-adopts the same rail-mode rendering the manual
    // S2.2 toggle produces (nav-link/brand text isn't just CSS-hidden - it's
    // conditionally rendered - so a real viewport check is needed here, not
    // a CSS-only media query, matching the pattern App.jsx already uses for
    // the 'system' theme's prefers-color-scheme listener). Below 680px the
    // sidebar instead becomes a dismissible off-canvas drawer (mobileOpen),
    // closed by default and toggled from a hamburger button in the topbar.
    const [isTabletWidth, setIsTabletWidth] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
    const [isMobileWidth, setIsMobileWidth] = useState(() => window.matchMedia('(max-width: 680px)').matches);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    useEffect(() => {
        const tabletMq = window.matchMedia('(max-width: 1024px)');
        const mobileMq = window.matchMedia('(max-width: 680px)');
        const onTablet = e => setIsTabletWidth(e.matches);
        const onMobile = e => setIsMobileWidth(e.matches);
        tabletMq.addEventListener('change', onTablet);
        mobileMq.addEventListener('change', onMobile);
        return () => {
            tabletMq.removeEventListener('change', onTablet);
            mobileMq.removeEventListener('change', onMobile);
        };
    }, []);
    // Resizing past the mobile breakpoint while the drawer is open would
    // otherwise leave mobileSidebarOpen stuck true for the next time the
    // viewport narrows again without an intervening navigation.
    useEffect(() => { if (!isMobileWidth) setMobileSidebarOpen(false); }, [isMobileWidth]);
    const effectiveCollapsed = mobileSidebarOpen ? false : (sidebarCollapsed || isTabletWidth);
    const location = useLocation();
    const pageMeta = PAGE_META[location.pathname];
    const pageTitle = pageMeta?.title || 'Hire AI';

    usePageTitle(pageTitle);

    // Close the mobile drawer on every navigation - otherwise it stays open
    // over the new page's content after a nav-link click.
    useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);

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
            setActivitiesError(false);
        } catch (err) {
            console.error('Failed to fetch activities', err);
            // G-20: a failed fetch used to leave `activities` at its last
            // known value with no signal, so a dead backend rendered as
            // either a stale list or (on first load) an indistinguishable
            // "No activity logged yet." - track the failure explicitly so
            // the drawer can show a real error + Retry instead of lying.
            setActivitiesError(true);
        } finally {
            setLoadingActivities(false);
        }
    };

    // External (client) accounts only ever see the job shortlists shared with
    // them — App.jsx redirects every other route to /jobs, so the nav must not
    // offer Dashboard / Candidates / Assistant either.
    const isExternal = user?.is_external === 1
    const primaryNavItems = isExternal
        ? [{ to: '/jobs', label: PAGE_TITLES['/jobs'], Icon: Briefcase }]
        : [
            { to: '/', label: PAGE_TITLES['/'], Icon: LayoutDashboard },
            ...((user?.is_hr === 1 || user?.is_admin === 1) ? [{ to: '/jobs', label: PAGE_TITLES['/jobs'], Icon: Briefcase }] : []),
            { to: '/upload', label: PAGE_TITLES['/upload'], Icon: Users },
            { to: '/chat', label: PAGE_TITLES['/chat'], Icon: MessageSquare },
        ]

    const workspaceNavItems = []
    if ((user?.role === 'admin' || user?.is_admin === 1) && !isExternal) {
        workspaceNavItems.push({ to: '/connect', label: PAGE_TITLES['/connect'], Icon: Link })
        workspaceNavItems.push({ to: '/templates', label: PAGE_TITLES['/templates'], Icon: FileText })
        workspaceNavItems.push({ to: '/admin', label: PAGE_TITLES['/admin'], Icon: Shield })
    }



    return (
        <div className="app-shell">
            {/* G-15: backdrop for the mobile off-canvas drawer - click to
                dismiss. Only meaningful (and only rendered) while the
                drawer is actually open. */}
            {mobileSidebarOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setMobileSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}
            {/* Sidebar */}
            <aside className={`sidebar${effectiveCollapsed ? ' collapsed' : ''}${mobileSidebarOpen ? ' mobile-open' : ''}`}>
                <div className="sidebar-brand" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                    <img
                        src={alamaticzMark}
                        alt="Alamaticz Solutions"
                        style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
                    />
                    {!effectiveCollapsed && <span className="sidebar-brand-name">Hire AI</span>}
                    {/* Collapse control lives on the brand row (not a sidebar-edge
                        tab). Below 1024px rail mode is automatic and the manual
                        toggle can't override it, so it's hidden there. */}
                    {!isTabletWidth && (
                        <button
                            type="button"
                            className="brand-rail-toggle"
                            onClick={() => setSidebarCollapsed(c => !c)}
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            style={{
                                marginLeft: effectiveCollapsed ? 0 : 'auto',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, flexShrink: 0, cursor: 'pointer',
                                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                                background: 'var(--surface-2)', color: 'var(--text-dim)',
                            }}
                        >
                            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                        </button>
                    )}
                </div>

                <nav className="sidebar-nav" aria-label="Primary">
                    {primaryNavItems.map(({ to, label, Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                            title={effectiveCollapsed ? label : undefined}
                            aria-label={effectiveCollapsed ? label : undefined}
                        >
                            <Icon size={18} />
                            {!effectiveCollapsed && label}
                        </NavLink>
                    ))}

                    {workspaceNavItems.length > 0 && (
                        <>
                            {effectiveCollapsed ? (
                                <div className="sidebar-nav-divider" aria-hidden="true" />
                            ) : (
                                <div style={{
                                    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                                    color: 'var(--text-dim)', padding: '18px 16px 6px'
                                }}>
                                    Workspace
                                </div>
                            )}
                            {workspaceNavItems.map(({ to, label, Icon }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    end={to === '/'}
                                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                                    title={effectiveCollapsed ? label : undefined}
                                    aria-label={effectiveCollapsed ? label : undefined}
                                >
                                    <Icon size={18} />
                                    {!effectiveCollapsed && label}
                                </NavLink>
                            ))}
                        </>
                    )}
                </nav>

                {!effectiveCollapsed && (
                    <div style={{
                        padding: '10px 16px', fontSize: 'var(--fs-1)', color: 'var(--text-subtle)',
                        borderTop: '1px solid var(--border)', textAlign: 'center',
                    }}>
                        Developed by Alamaticz Solutions
                    </div>
                )}

            </aside>

            {/* Main */}
            <main className="main-content">
                <header className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* G-15: only visible via CSS at <=680px (.sidebar-mobile-toggle's
                            default display:none) - opens the off-canvas drawer above. */}
                        <button
                            type="button"
                            className="sidebar-mobile-toggle"
                            onClick={() => setMobileSidebarOpen(o => !o)}
                            aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-expanded={mobileSidebarOpen}
                        >
                            <Menu size={18} />
                        </button>
                        {/* The sidebar already shows this page's icon next to its nav
                            label one click away - repeating it here in a same-size box
                            right next to a two-line title/subtitle block was the source
                            of the "logo and header line don't align" report: the icon's
                            own vertical center never matched the title baseline once a
                            subtitle wrapped under it. Text-only heading, tighter
                            title/subtitle gap, matching the audit's tightened topbar. */}
                        <div className="topbar-heading">
                            <div style={{ minWidth: 0 }}>
                                <h1 className="page-title">{pageTitle}</h1>
                                {pageMeta?.subtitle && <p className="page-subtitle">{pageMeta.subtitle}</p>}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* S2.9: was a single 36px toggle with no visible label and no
                            System option, defaulting a fresh viewer to light regardless
                            of their OS preference. A three-way group with a visible label
                            per option covers Light/Dark/System and honors
                            prefers-color-scheme (see App.jsx's `resolvedTheme`). */}
                        {/* Was 30x30px segments (below the 44px touch minimum, on the
                            app's primary theme control) with transition:'all 0.2s' -
                            which animates layout properties like width/border-radius
                            too, not just the color change it's meant for - and a 15px
                            gap from the profile chip next to it while every other
                            topbar gap is 12px. */}
                        {/* Accent hue picker — sets data-accent on <html> via
                            App.jsx; index.css has a per-hue token override block. */}
                        {onChangeAccent && (
                            <div
                                role="radiogroup"
                                aria-label="Accent colour"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 44, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-full)', padding: '0 8px' }}
                            >
                                {ACCENTS.map(({ value, label, swatch }) => {
                                    const selected = (accent || 'amber') === value
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            aria-label={label}
                                            title={label}
                                            onClick={() => onChangeAccent(value)}
                                            style={{
                                                width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0,
                                                background: swatch,
                                                border: selected ? '2px solid var(--text)' : '2px solid transparent',
                                                boxShadow: selected ? '0 0 0 1px var(--border)' : 'none',
                                                transition: 'border-color 0.15s',
                                            }}
                                        />
                                    )
                                })}
                            </div>
                        )}
                        <div
                            role="radiogroup"
                            aria-label="Theme"
                            style={{ display: 'flex', alignItems: 'center', gap: 2, height: 44, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-full)', padding: '0 3px' }}
                        >
                            {THEME_OPTIONS.map(({ value, label, Icon }) => {
                                const selected = theme === value
                                // 'system' doesn't say which theme is actually painted, so spell
                                // it out for that one option using App.jsx's resolved value.
                                const title = value === 'system' ? `${label} (currently ${resolvedTheme})` : label
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={title}
                                        title={title}
                                        onClick={() => setTheme(value)}
                                        style={{
                                            width: 36, height: 32, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s, color 0.2s',
                                            background: selected ? 'var(--action)' : 'transparent',
                                            color: selected ? 'var(--action-fg)' : 'var(--text-dim)',
                                        }}
                                    >
                                        <Icon size={14} />
                                    </button>
                                )
                            })}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="profile-chip"
                                title={user?.active_persona ? `Logged in as Admin, acting as ${user.active_persona}` : `Logged in as ${user.full_name}`}
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                aria-haspopup="menu"
                                aria-expanded={showProfileMenu}
                                style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                            >
                            <div className="profile-avatar" style={{
                                background: 'var(--gold)',
                                transition: 'all 0.3s ease'
                            }}>
                                {(user?.active_persona?.[0] || user?.full_name?.[0] || 'H').toUpperCase()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                                <span className="profile-name" style={{
                                    fontWeight: user?.active_persona ? 'bold' : 'normal',
                                    color: user?.active_persona ? 'var(--gold)' : 'var(--text)',
                                    transition: 'all 0.3s ease'
                                }}>
                                    {user?.active_persona ? `${user.active_persona} (Admin)` : (user?.full_name || 'HR User')}
                                </span>
                                {/* S2.4: role-derived nav items (Jobs, Workspace section) disappear
                                    with no explanation - a user can't tell "I don't have access" from
                                    "this feature doesn't exist". Naming the role here at least answers
                                    "why don't I see X" without building per-item locked/disabled states. */}
                                {!user?.active_persona && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>
                                        {(user?.role === 'admin' || user?.is_admin === 1) ? 'Admin' : user?.is_external === 1 ? 'External' : user?.is_hr === 1 ? 'HR' : 'User'}
                                    </span>
                                )}
                            </div>
                            <ChevronDown
                                size={14}
                                style={{
                                    color: 'var(--text-dim)', flexShrink: 0, transition: 'transform 0.15s ease',
                                    transform: showProfileMenu ? 'rotate(180deg)' : 'none',
                                }}
                            />
                            </button>

                            {/* Profile Dropdown - reuses useModalA11y (focus trap, Escape,
                                focus restore on close) the same way every modal in the app
                                does, plus role="menu"/"menuitem" and real CSS :hover/
                                :focus-visible states (.dropdown-menu-item in index.css)
                                instead of onMouseEnter/onMouseLeave, which gave a keyboard
                                user tabbing to Logout no visual feedback at all. */}
                            {showProfileMenu && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setShowProfileMenu(false)}></div>
                                    <div
                                        ref={profileMenuRef}
                                        role="menu"
                                        aria-label="Profile menu"
                                        style={{
                                            position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '200px',
                                            background: 'var(--navy-dark)', border: '1px solid var(--border)', borderRadius: '8px',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 999, overflow: 'hidden'
                                        }}
                                    >
                                        {(user?.role === 'admin' || user?.is_admin === 1) && (
                                            <button
                                                role="menuitem"
                                                className="dropdown-menu-item"
                                                onClick={() => { setShowProfileMenu(false); setShowActivitySidebar(true); }}
                                            >
                                                <Activity size={16} color="var(--gold)" />
                                                Activity Feed
                                            </button>
                                        )}
                                        <button role="menuitem" className="dropdown-menu-item danger" onClick={onLogout}>
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
                    {user?.is_approved !== 1 && !pendingBannerDismissed && (
                        <div role="status" style={{
                            background: 'var(--warning-bg)',
                            borderBottom: '1px solid var(--warning-fg)',
                            color: 'var(--warning-fg)',
                            padding: '12px 24px',
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: '500'
                        }}>
                            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>
                                <strong>Access Pending:</strong> Your account is currently awaiting administrator approval. You can navigate the portal, but no candidate or job data will be visible.
                            </span>
                            <button
                                type="button"
                                aria-label="Dismiss for this session"
                                onClick={() => {
                                    sessionStorage.setItem('hire_ai_pending_banner_dismissed', '1');
                                    setPendingBannerDismissed(true);
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--warning-fg)', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 2 }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    <Outlet context={{ user, onUpdateUser }} />
                </div>
                
                {/* Activity Feed Overlay Sidebar - was a plain <div> with no
                    role="dialog", no aria-modal, no Escape and no focus trap,
                    unlike every other overlay in the app. Same useModalA11y
                    hook as the modals and the profile menu above. */}
                {showActivitySidebar && (
                    <>
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setShowActivitySidebar(false)}></div>
                        <div
                            ref={activityDrawerRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="activity-drawer-title"
                            style={{
                                position: 'fixed', top: 0, right: 0, bottom: 0, width: '350px', maxWidth: '100vw',
                                background: 'var(--navy)', borderLeft: '1px solid var(--border)', zIndex: 1001,
                                display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 25px rgba(0,0,0,0.5)',
                                animation: 'slideInRight 0.3s ease forwards'
                            }}
                        >
                            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--navy-dark)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Activity size={20} color="var(--gold)" />
                                    <h3 id="activity-drawer-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Activity Feed</h3>
                                </div>
                                <button onClick={() => setShowActivitySidebar(false)} aria-label="Close activity feed" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {loadingActivities && activities.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0' }}>Loading…</div>
                                ) : activitiesError ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0', fontSize: '0.9rem' }}>
                                        <p style={{ margin: '0 0 10px' }}>Couldn't load activity.</p>
                                        <button type="button" className="btn btn-secondary" onClick={fetchActivities} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                                            Retry
                                        </button>
                                    </div>
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
                                                {/* Was action-orange + bold, the same color reserved for
                                                    interactive elements - implying the username is a link,
                                                    and showing a second identity (username) for the same
                                                    person the topbar already shows by full name. Neutral
                                                    avatar + weight, username kept as a tooltip only. */}
                                                <div
                                                    title={act.username}
                                                    style={{
                                                        width: '32px', height: '32px', borderRadius: '50%',
                                                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                                                        color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 600, fontSize: '0.8rem', flexShrink: 0
                                                    }}
                                                >
                                                    {initials}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--text)' }} title={act.username}>
                                                        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{act.full_name || act.username}</strong>{' '}
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
                    </>
                )}
            </main>

        </div>
    )
}
