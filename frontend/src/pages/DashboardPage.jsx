import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer
} from 'recharts'
import { Users, Briefcase, ListChecks, Send, Timer, BarChart3, Activity as ActivityIcon } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'

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

const PIPELINE_STAGES = [
    { key: 'New', varName: '--st-new-bg' },
    { key: 'In-Review', varName: '--st-review-bg' },
    { key: 'Available', varName: '--st-avail-bg' },
    { key: 'Selected', varName: '--st-selected-bg' },
    { key: 'Engaged', varName: '--st-engaged-bg' },
    { key: 'Offered', varName: '--st-offered-bg' },
    { key: 'Hired', varName: '--st-hired-bg' },
    { key: 'Rejected', varName: '--st-rejected-bg' },
]
const CHART_VAR_NAMES = ['--chart-1', '--chart-2', '--text-muted', '--surface', ...PIPELINE_STAGES.map(s => s.varName)]

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
    const { toast, showToast, dismissToast } = useToast()
    const chartColors = useCssVars(CHART_VAR_NAMES)

    const [candidates, setCandidates] = useState([])
    const [jobs, setJobs] = useState([])
    const [activities, setActivities] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([
            apiClient.get('/api/candidates'),
            apiClient.get('/api/jobs', { headers: { 'x-user-username': user?.username } }),
            apiClient.get('/api/activity'),
        ]).then(([candRes, jobsRes, activityRes]) => {
            setCandidates(candRes.data)
            setJobs(jobsRes.data)
            setActivities(activityRes.data.slice(0, 8))
        }).catch(() => {
            // G-20: this used to fail silently (.catch(() => {})), so a
            // backend hiccup rendered as an empty dashboard indistinguishable
            // from "no data yet" - now it's a visible, dismissible error.
            showToast('Failed to load dashboard data.', 'error')
        }).finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const totalCandidates = candidates.length
    const openJobs = jobs.filter(j => j.job_status === 'In-progress').length
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

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
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
                <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                    <BarChart3 size={40} style={{ marginBottom: '1rem', color: 'var(--text-dim)' }} />
                    <p style={{ fontSize: '1.1rem', fontFamily: 'var(--fh)', color: 'var(--gold)' }}>No Data Yet</p>
                    <p style={{ marginTop: '0.5rem' }}>Upload resumes and create jobs to see pipeline insights here.</p>
                </div>
            ) : (
                <div className="charts-grid dashboard-charts-grid" style={{ alignItems: 'stretch' }}>
                    <div className="card">
                        <div className="card-title"><BarChart3 size={17} /> Pipeline by Stage</div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
                        <div className="card-title"><Timer size={17} /> Notice Period</div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={noticeData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
                        <div className="card-title"><ActivityIcon size={17} /> Recent Activity</div>
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
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', background: 'var(--gold)',
                                                color: 'var(--action-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 'bold', fontSize: '0.72rem', flexShrink: 0,
                                            }}>
                                                {initials}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                                                    <strong style={{ color: 'var(--gold)' }}>{act.username}</strong>{' '}
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

            <ToastHost toast={toast} onDismiss={dismissToast} />
        </div>
    )
}
