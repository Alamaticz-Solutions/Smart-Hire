import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Download, RefreshCw, Search, RotateCcw } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { formatApiError } from '../utils/apiError'

const PAGE_SIZE = 50

const OUTCOMES = [
    { key: '', label: 'All' },
    { key: 'imported', label: 'Imported' },
    { key: 'follow_up', label: 'Follow-ups' },
    { key: 'failed', label: 'Failed', danger: true },
    { key: 'pending_retry', label: 'Waiting to retry' },
    { key: 'skipped_automated', label: 'Skipped (automated)' },
    { key: 'no_resume', label: 'No resume' },
    { key: 'legacy_file', label: 'Legacy .doc/.xls' },
    { key: 'not_pulled', label: 'Not pulled yet' },
]

const OUTCOME_STYLE = {
    imported: { bg: 'rgba(74,222,128,0.15)', fg: '#4ade80', label: 'Imported' },
    follow_up: { bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa', label: 'Follow-up' },
    failed: { bg: 'rgba(248,113,113,0.15)', fg: '#f87171', label: 'Failed' },
    pending_retry: { bg: 'rgba(250,204,21,0.15)', fg: '#facc15', label: 'Will retry' },
    skipped_automated: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', label: 'Skipped' },
    no_resume: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', label: 'No resume' },
    legacy_file: { bg: 'rgba(251,146,60,0.15)', fg: '#fb923c', label: '.doc / .xls' },
    not_pulled: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', label: 'Not pulled' },
}

const HEALTH = {
    ok: { color: '#4ade80', text: 'Poller running' },
    stale: { color: '#facc15', text: 'Poller has not reached the mailbox recently' },
    error: { color: '#f87171', text: 'Poller error' },
    off: { color: '#94a3b8', text: 'Mail sync is off' },
}

const fmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? iso : `${iso}Z`)  // stored in UTC
    return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function Chip({ outcome }) {
    const s = OUTCOME_STYLE[outcome] || { bg: 'var(--input-bg)', fg: 'var(--text-dim)', label: outcome }
    return <span style={{ background: s.bg, color: s.fg, padding: '3px 9px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
}

export default function MailInboxPage() {
    const { user } = useOutletContext()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const [outcome, setOutcome] = useState('')
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [page, setPage] = useState(0)
    const [data, setData] = useState({ items: [], total: 0 })
    const [summary, setSummary] = useState({ total: 0, by_outcome: {}, poller: { health: 'off' } })
    const [selected, setSelected] = useState(new Set())
    const [loading, setLoading] = useState(true)

    const params = useMemo(() => ({
        ...(outcome ? { outcome } : {}), ...(query ? { search: query } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}),
    }), [outcome, query, dateFrom, dateTo])

    const latest = useRef(0)
    const load = useCallback(async () => {
        const ticket = ++latest.current   // a slower, older response must not overwrite a newer one
        setLoading(true)
        try {
            const [list, sum] = await Promise.all([
                apiClient.get('/api/mail/messages', { params: { ...params, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
                apiClient.get('/api/mail/summary'),
            ])
            if (ticket !== latest.current) return
            setData(list.data)
            setSummary(sum.data)
        } catch (err) {
            showToast(formatApiError(err, 'Could not load the mail log.'), 'error')
        } finally {
            if (ticket === latest.current) setLoading(false)
        }
    }, [params, page])  // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load() }, [load])
    useEffect(() => { setPage(0); setSelected(new Set()) }, [params])

    const download = async () => {
        try {
            const res = await apiClient.get('/api/mail/messages/export.xlsx', { params, responseType: 'blob' })
            const url = URL.createObjectURL(res.data)
            const a = document.createElement('a')
            a.href = url; a.download = 'mail_log.xlsx'; a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            showToast(formatApiError(err, 'Download failed.'), 'error')
        }
    }

    const retry = async () => {
        try {
            const res = await apiClient.post('/api/mail/messages/retry', { msg_uids: [...selected] })
            showToast(`${res.data.queued} mail(s) queued - the next poll imports them again.`)
            setSelected(new Set())
            load()
        } catch (err) {
            showToast(formatApiError(err, 'Could not queue the retry.'), 'error')
        }
    }

    const toggle = (uid) => setSelected(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
    const health = HEALTH[summary.poller?.health] || HEALTH.off
    const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
    const input = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }

    if (!(user?.is_admin === 1 || user?.is_hr === 1)) return null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />

            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: health.color }} />
                        {health.text}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                        {summary.poller?.last_ok ? `Last reached the mailbox: ${fmt(summary.poller.last_ok)}` : 'The poller has not reached the mailbox yet.'}
                        {' · '}Auto-reply: <strong>{summary.poller?.auto_reply ? 'ON' : 'OFF'}</strong>
                        {' · '}<Link to="/connect" style={{ color: 'var(--gold)' }}>Mail settings</Link>
                    </div>
                    {summary.poller?.last_error && <div style={{ fontSize: '0.78rem', color: '#f87171', marginTop: 4 }}>{summary.poller.last_error}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
                    <button className="btn btn-secondary" onClick={download}><Download size={14} /> Download Excel</button>
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} role="group" aria-label="Filter by outcome">
                    {OUTCOMES.map(o => {
                        const n = o.key ? summary.by_outcome?.[o.key] || 0 : summary.total
                        const active = outcome === o.key
                        return (
                            <button key={o.key || 'all'} type="button" onClick={() => setOutcome(o.key)} aria-pressed={active}
                                style={{
                                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                                    border: '1px solid var(--border)', background: active ? 'var(--gold)' : 'transparent',
                                    color: active ? 'var(--action-fg)' : (o.danger && n > 0 ? '#fca5a5' : 'var(--text-dim)'),
                                }}>
                                {o.label} <span style={{ opacity: 0.8 }}>{n}</span>
                            </button>
                        )
                    })}
                </div>

                <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-dim)' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sender, subject, file…" style={{ ...input, paddingLeft: 30, width: 260 }} />
                    </div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Received from <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} style={input} /></label>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>to <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} style={input} /></label>
                    <button className="btn btn-secondary" type="submit">Search</button>
                    {selected.size > 0 && (
                        <button className="btn" type="button" onClick={retry} style={{ marginLeft: 'auto', background: 'var(--gold)', color: 'var(--action-fg)', border: 'none', fontWeight: 700 }}>
                            <RotateCcw size={14} /> Retry {selected.size} selected
                        </button>
                    )}
                </form>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-subtle)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                                <th style={{ padding: '8px 6px', width: 28 }} />
                                <th style={{ padding: '8px 6px' }}>Received</th>
                                <th style={{ padding: '8px 6px' }}>From</th>
                                <th style={{ padding: '8px 6px' }}>Subject</th>
                                <th style={{ padding: '8px 6px' }}>Attachments</th>
                                <th style={{ padding: '8px 6px' }}>Outcome</th>
                                <th style={{ padding: '8px 6px' }}>Candidate</th>
                                <th style={{ padding: '8px 6px' }}>Reply</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map(m => (
                                <tr key={m.msg_uid} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                                    <td style={{ padding: '8px 6px' }}>
                                        {['failed', 'pending_retry', 'no_resume', 'legacy_file', 'not_pulled'].includes(m.outcome) &&
                                            <input type="checkbox" checked={selected.has(m.msg_uid)} onChange={() => toggle(m.msg_uid)} aria-label="Select for retry" />}
                                    </td>
                                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fmt(m.received_at)}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <div style={{ fontWeight: 600 }}>{m.sender_name || '—'}</div>
                                        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{m.sender_email}</div>
                                    </td>
                                    <td style={{ padding: '8px 6px', maxWidth: 280 }}>{m.subject || '(no subject)'}</td>
                                    <td style={{ padding: '8px 6px', maxWidth: 200, color: 'var(--text-dim)' }}>{m.attachments || '—'}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <Chip outcome={m.outcome} />
                                        {m.reason && <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 4, maxWidth: 260 }}>{m.reason}</div>}
                                    </td>
                                    <td style={{ padding: '8px 6px' }}>
                                        {m.candidate_id ? <Link to={`/candidates/${m.candidate_id}`} style={{ color: 'var(--gold)' }}>{m.candidate_name || `#${m.candidate_id}`}</Link> : '—'}
                                    </td>
                                    <td style={{ padding: '8px 6px', color: 'var(--text-dim)' }}>{m.reply_status || '—'}</td>
                                </tr>
                            ))}
                            {!loading && data.items.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>No mail matches this filter yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    <span>{data.total} mail(s)</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                        Page {page + 1} of {pages}
                        <button className="btn btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
                    </span>
                </div>
            </div>
        </div>
    )
}
