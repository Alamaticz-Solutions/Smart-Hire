import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer
} from 'recharts'
import { Users, Briefcase, ListChecks, Send, Timer, BarChart3, Activity as ActivityIcon, Mail, Upload, Check } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { SkeletonKPIRow, SkeletonBlock } from '../components/shared/Skeleton'

// Reads resolved CSS custom property values via getComputedStyle rather than
// handing Recharts literal 'var(--x)' strings - SVG presentation attributes
// resolving a custom property isn't guaranteed the way a stylesheet rule is.
// Re-reads on theme toggle (watched via MutationObserver on documentElement's
// data-theme) so a dark/light switch updates the chart without a reload.
function useCssVars(names) {
    const [values, setValues] = useState(() => readVars(names))

    useEffect(() => {
        const update = () => setValues(readVars(names))
        update()
        const observer = new MutationObserver(update)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [names.join(',')])

    return values
}

function readVars(names) {
    const style = getComputedStyle(document.documentElement)
    const out = {}
    names.forEach(name => { out[name] = style.getPropertyValue(name).trim() })
    return out
}

// The chip *background* tokens (--st-*-bg) are deliberately low-contrast -
// they're meant to sit behind the chip's own saturated text color, not to
// stand alone as a bar fill on a plain card background (in light mode
// --st-new-bg is ~1.1:1 against --surface - functionally invisible). The
// *text* tokens are the saturated color already designed to read on its own.
const PIPELINE_STAGES = [
    { key: 'New', varName: '--st-new-text' },
    { key: 'In-Review', varName: '--st-review-text' },
    { key: 'Available', varName: '--st-avail-text' },
    { key: 'Selected', varName: '--st-selected-text' },
    { key: 'Engaged', varName: '--st-engaged-text' },
    { key: 'Offered', varName: '--st-offered-text' },
    { key: 'Hired', varName: '--st-hired-text' },
    { key: 'Rejected', varName: '--st-rejected-text' },
]
const CHART_VAR_NAMES = ['--chart-1', '--chart-2', '--text-muted', '--surface', '--border', ...PIPELINE_STAGES.map(s => s.varName)]

const isImmediate = (val) => {
    if (val === 0 || val === '0') return true
    return String(val || '').toLowerCase().includes('immediate')
}

// Rebuilt per the design audit's S3 findings: the old "dashboard" was two
// KPIs plus the exact same candidate spreadsheet that already lives on the
// Candidates page (S3.1) - duplicated delete button, duplicated Add Column,
// duplicated Download Excel, everything. This page now answers a different
// question (what does today's pipeline look like) instead of re-rendering
// the candidates list a second time; the actual candidate management (edit,
// delete, custom columns, export) stays on the Candidates page's DataTable.
export default function DashboardPage() {
    const { user } = useOutletContext()
    const navigate = useNavigate()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const chartColors = useCssVars(CHART_VAR_NAMES)

    const [candidates, setCandidates] = useState([])
    const [jobs, setJobs] = useState([])
    const [activities, setActivities] = useState([])
    const [mailboxConnected, setMailboxConnected] = useState(null) // null = unknown (non-admin can't check)
    const [loading, setLoading] = useState(true)

    // G-28: the empty dashboard used to be a dead end for a brand-new
    // approved user - no next step, just "No Data Yet". /api/integrations
    // is admin-only, so a non-admin gets `mailboxConnected` left at null
    // (unknown) rather than a wrong "not connected" claim.
    const canSeeIntegrations = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1

    useEffect(() => {
        Promise.all([
            apiClient.get('/api/candidates'),
            apiClient.get('/api/jobs', { headers: { 'x-user-username': user?.username } }),
            apiClient.get('/api/activity'),
            canSeeIntegrations
                ? apiClient.get('/api/integrations', { headers: { 'x-user-username': user?.username } }).catch(() => null)
                : Promise.resolve(null),
        ]).then(([candRes, jobsRes, activityRes, integrationsRes]) => {
            setCandidates(candRes.data)
            setJobs(jobsRes.data)
            setActivities(activityRes.data.slice(0, 8))
            if (integrationsRes) {
                const s = integrationsRes.data
                setMailboxConnected(!!(s.email_enabled || s.gmail_enabled || s.outlook_enabled))
            }
        }).catch(() => {
            // G-20: this used to fail silently (.catch(() => {})), so a
            // backend hiccup rendered as an empty dashboard indistinguishable
            // from "no data yet" - now it's a visible, dismissible error.
            showToast('Failed to load dashboard data.', 'error')
        }).finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const totalCandidates = candidates.length
    // Matches the same fallback JobStatusChip/JobsOverview use: a job with
    // no job_status set displays and counts as In-progress, so this KPI
    // doesn't undercount relative to what the Jobs page itself shows.
    const openJobs = jobs.filter(j => (j.job_status || 'In-progress') === 'In-progress').length
    const inReview = candidates.filter(c => String(c.candidate_status || 'New').trim() === 'In-Review').length
    const offersOut = candidates.filter(c => String(c.candidate_status || 'New').trim() === 'Offered').length
    const immediateJoiners = candidates.filter(c => isImmediate(c.notice_period)).length

    const pipelineData = PIPELINE_STAGES.map(stage => ({
        name: stage.key,
        value: candidates.filter(c => String(c.candidate_status || 'New').trim() === stage.key).length,
        fill: chartColors[stage.varName],
    }))

    const noticeCounts = {}
    candidates.forEach(c => {
        let k = String(c.notice_period ?? '').trim()
        if (k === '0') k = 'Immediate'
        else if (k !== '' && !isNaN(k)) k = `${k} days`
        if (k) noticeCounts[k] = (noticeCounts[k] || 0) + 1
    })
    const noticeData = Object.entries(noticeCounts).map(([name, value]) => ({ name, value }))

    const kpis = [
        { label: 'Total Candidates', value: totalCandidates, Icon: Users, onClick: () => navigate('/upload') },
        { label: 'Open Jobs', value: openJobs, Icon: Briefcase, onClick: () => navigate('/jobs') },
        { label: 'In Review', value: inReview, Icon: ListChecks, onClick: () => navigate('/upload') },
        { label: 'Offers Out', value: offersOut, Icon: Send, onClick: () => navigate('/upload') },
        { label: 'Immediate Joiners', value: immediateJoiners, Icon: Timer, onClick: () => navigate('/upload') },
    ]

    // G-21: a single 40px spinner replacing the entire page caused a full
    // layout shift the moment real content arrived. Mirroring the KPI row
    // + charts shape here means arrival only swaps content in place.
    if (loading) return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }} aria-busy="true" aria-label="Loading dashboard">
            <SkeletonKPIRow count={4} />
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SkeletonBlock width={180} height={20} />
                <SkeletonBlock height={220} radius={10} />
            </div>
        </div>
    )

    return (
        <div style={{ padding: '2rem', flex: 1 }}>
            {/* KPIs — each navigates to where that data actually lives (Candidates
                or Jobs) instead of the old in-page "filter the table below" pattern,
                which had no removable filter chip and no result count (S3.3). */}
            <div className="kpi-grid">
                {kpis.map(({ label, value, Icon, onClick }) => (
                    <button
                        type="button"
                        className="kpi-card"
                        key={label}
                        onClick={onClick}
                        style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                    >
                        <div style={{
                            width: 36, height: 36, background: 'rgba(var(--gold-rgb), 0.12)',
                            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 10,
                        }}>
                            <Icon size={18} color="var(--gold)" />
                        </div>
                        <div className="kpi-value">{value}</div>
                        <div className="kpi-label">{label}</div>
                    </button>
                ))}
            </div>

            {candidates.length === 0 && jobs.length === 0 ? (
                <div className="card" style={{ padding: '2.5rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <BarChart3 size={40} style={{ marginBottom: '1rem', color: 'var(--text-dim)' }} />
                        {/* Was "No Data Yet" in Title Case, --fs-6-sized (17.6px), and
                            action-orange - the only Title Case heading in the app, and
                            in the color reserved for interactive elements despite being
                            plain text. This heading isn't an error state, it's an
                            onboarding prompt, so it reads as one now. */}
                        <p style={{ fontSize: 'var(--fs-6)', fontFamily: 'var(--fh)', fontWeight: 700, color: 'var(--text)' }}>Let's set up your pipeline</p>
                        <p style={{ marginTop: '0.5rem', color: 'var(--text-dim)' }}>Get started in three steps:</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '460px', margin: '0 auto' }}>
                        {[
                            { key: 'mailbox', label: 'Connect a mailbox', Icon: Mail, done: canSeeIntegrations ? mailboxConnected : null, to: '/connect' },
                            { key: 'upload', label: 'Upload resumes', Icon: Upload, done: candidates.length > 0, to: '/upload' },
                            { key: 'job', label: 'Create a job', Icon: Briefcase, done: jobs.length > 0, to: '/jobs' },
                        ].map((step, i) => (
                            <button
                                key={step.key}
                                type="button"
                                autoFocus={i === 0}
                                onClick={() => navigate(step.to)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
                                    padding: '14px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
                                    background: 'var(--surface)', cursor: 'pointer', font: 'inherit', color: 'var(--text)',
                                }}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem',
                                    background: step.done ? 'var(--st-hired-bg)' : 'var(--surface-sunken)',
                                    color: step.done ? 'var(--st-hired-text)' : 'var(--text-dim)',
                                }}>
                                    {step.done ? <Check size={14} /> : i + 1}
                                </div>
                                <step.Icon size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                                <span style={{ flex: 1, fontWeight: 600 }}>{step.label}</span>
                                {step.done === false && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>To do</span>}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="charts-grid dashboard-charts-grid" style={{ alignItems: 'stretch' }}>
                    <div className="card">
                        <div className="card-title"><BarChart3 size={16} /> Pipeline by Stage</div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartColors['--border']} />
                                <XAxis dataKey="name" tick={{ fill: chartColors['--text-muted'], fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis tick={{ fill: chartColors['--text-muted'], fontSize: 12 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: chartColors['--surface'], border: '1px solid rgba(var(--gold-rgb), 0.3)', borderRadius: 10, color: 'var(--text)' }} />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {pipelineData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="card">
                        <div className="card-title"><Timer size={16} /> Notice Period</div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={noticeData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartColors['--border']} />
                                <XAxis dataKey="name" tick={{ fill: chartColors['--text-muted'], fontSize: 12 }} angle={-30} textAnchor="end" />
                                <YAxis tick={{ fill: chartColors['--text-muted'], fontSize: 12 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: chartColors['--surface'], border: '1px solid rgba(var(--gold-rgb), 0.3)', borderRadius: 10, color: 'var(--text)' }} />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {noticeData.map((_, i) => <Cell key={i} fill={chartColors[i % 2 === 0 ? '--chart-1' : '--chart-2']} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 280 }}>
                        <div className="card-title"><ActivityIcon size={16} /> Recent Activity</div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: 280 }}>
                            {activities.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0', fontSize: '0.85rem' }}>No activity logged yet.</div>
                            ) : (
                                activities.map(act => {
                                    const initials = act.username ? act.username.substring(0, 2).toUpperCase() : 'U'
                                    const date = new Date(act.timestamp)
                                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
                                    return (
                                        <div key={act.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                            {/* Was action-orange bold, the color reserved for interactive
                                                elements, and a second identity (username) for the same
                                                person shown by full name in the topbar. */}
                                            <div title={act.username} style={{
                                                width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)',
                                                color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 600, fontSize: '0.72rem', flexShrink: 0,
                                            }}>
                                                {initials}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text)' }} title={act.username}>
                                                    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{act.full_name || act.username}</strong>{' '}
                                                    <span style={{ color: 'var(--text-muted)' }}>{act.action}</span>
                                                </div>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)' }}>
                                                    {dateStr} at {timeStr}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
        </div>
    )
}
