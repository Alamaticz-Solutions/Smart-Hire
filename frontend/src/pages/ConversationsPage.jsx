import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { RefreshCw, Search, Send, Check, X, Pencil } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { formatApiError } from '../utils/apiError'

const PAGE_SIZE = 25

const STATUS_FILTERS = [
    { key: '', label: 'All' },
    { key: 'draft', label: 'Needs approval' },
    { key: 'pending', label: 'Waiting to send' },
    { key: 'sent', label: 'Sent' },
    { key: 'skipped', label: 'Skipped' },
    { key: 'failed', label: 'Failed', danger: true },
]
const KIND_FILTERS = [
    { key: '', label: 'Everything' },
    { key: 'answer', label: 'Questions answered by AI' },
    { key: 'acknowledgement', label: 'Acknowledgements' },
]
const STATUS_STYLE = {
    draft: { fg: '#facc15', bg: 'rgba(250,204,21,0.15)', label: 'Needs approval' },
    pending: { fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)', label: 'Waiting' },
    sent: { fg: '#4ade80', bg: 'rgba(74,222,128,0.15)', label: 'Sent' },
    skipped: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.15)', label: 'Skipped' },
    failed: { fg: '#f87171', bg: 'rgba(248,113,113,0.15)', label: 'Failed' },
}

const fmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? iso : `${iso}Z`)
    return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function StatusChip({ status }) {
    const s = STATUS_STYLE[status] || { fg: 'var(--text-dim)', bg: 'var(--input-bg)', label: status }
    return <span style={{ background: s.bg, color: s.fg, padding: '3px 9px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
}

const input = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }

export default function ConversationsPage() {
    const { user } = useOutletContext()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [status, setStatus] = useState('')
    const [kind, setKind] = useState('')
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(0)
    const [data, setData] = useState({ items: [], total: 0 })
    const [summary, setSummary] = useState({ by_status: {}, auto_reply: false, ai_answers_mode: 'draft' })
    const [openId, setOpenId] = useState(null)
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const [batch, setBatch] = useState({ date_from: '', date_to: '', include_drafts: false })
    const [preview, setPreview] = useState(null)

    const params = useMemo(() => ({ ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(query ? { search: query } : {}) }), [status, kind, query])
    const latest = useRef(0)

    const load = useCallback(async () => {
        const ticket = ++latest.current
        try {
            const [list, sum] = await Promise.all([
                apiClient.get('/api/conversations', { params: { ...params, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
                apiClient.get('/api/conversations/summary'),
            ])
            if (ticket !== latest.current) return
            setData(list.data)
            setSummary(sum.data)
        } catch (err) {
            showToast(formatApiError(err, 'Could not load conversations.'), 'error')
        }
    }, [params, page])  // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load() }, [load])
    useEffect(() => { setPage(0); setOpenId(null) }, [params])

    const act = async (fn, okMessage) => {
        setBusy(true)
        try {
            await fn()
            if (okMessage) showToast(okMessage)
            await load()
        } catch (err) {
            showToast(formatApiError(err, 'That did not work.'), 'error')
        } finally {
            setBusy(false)
        }
    }

    const open = (row) => { setOpenId(openId === row.id ? null : row.id); setDraft(row.reply_body) }
    const save = (row) => act(() => apiClient.put(`/api/conversations/${row.id}`, { reply: draft }), 'Reply saved.')
    const approve = (row) => act(() => apiClient.post(`/api/conversations/${row.id}/approve`), 'Approved - it will go out with the queue.')
    const dismiss = (row) => act(() => apiClient.post(`/api/conversations/${row.id}/dismiss`), 'Dismissed.')

    const send = async (row) => {
        const ok = await confirm({
            title: `Send this reply to ${row.recipient}?`,
            message: 'It is e-mailed right now from the careers mailbox. People already e-mailed recently are blocked automatically.',
            confirmLabel: 'Send now', danger: false,
        })
        if (!ok) return
        setBusy(true)
        try {
            if (draft && openId === row.id && draft !== row.reply_body) await apiClient.put(`/api/conversations/${row.id}`, { reply: draft })
            await apiClient.post(`/api/conversations/${row.id}/send`)
            showToast('Sent.')
            await load()
        } catch (err) {
            const detail = err.response?.data?.detail || ''
            if (err.response?.status === 409) {
                const again = await confirm({ title: 'Already e-mailed', message: `${detail}. Send anyway?`, confirmLabel: 'Send anyway', danger: true })
                if (again) {
                    try { await apiClient.post(`/api/conversations/${row.id}/send`, { force: true }); showToast('Sent.'); await load() }
                    catch (e2) { showToast(formatApiError(e2), 'error') }
                }
            } else {
                showToast(formatApiError(err, 'Could not send.'), 'error')
            }
        } finally {
            setBusy(false)
        }
    }

    const runPreview = async () => {
        setBusy(true)
        try {
            setPreview((await apiClient.post('/api/conversations/send-batch', { ...batch, dry_run: true })).data)
        } catch (err) {
            showToast(formatApiError(err, 'Could not prepare the preview.'), 'error')
        } finally { setBusy(false) }
    }

    const sendBatch = async () => {
        const ok = await confirm({
            title: `Send ${preview.would_send} replies?`,
            message: `Each person is e-mailed once from the careers mailbox. ${preview.would_skip} will be skipped (already e-mailed, already answered, or failed candidates). This cannot be undone.`,
            confirmLabel: `Send ${preview.would_send} replies`, danger: true,
        })
        if (!ok) return
        setBusy(true)
        try {
            const res = (await apiClient.post('/api/conversations/send-batch', { ...batch, dry_run: false, confirm: true })).data
            showToast(`Sent ${res.sent}. Skipped ${res.skipped}. Failed ${res.failed}.`)
            setPreview(null)
            await load()
        } catch (err) {
            showToast(formatApiError(err, 'The batch could not be sent.'), 'error')
        } finally { setBusy(false) }
    }

    if (!(user?.is_admin === 1 || user?.is_hr === 1)) return null
    const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
    const th = { padding: '8px 6px', textAlign: 'left', color: 'var(--text-subtle)', fontSize: '0.72rem', textTransform: 'uppercase' }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            <ConfirmDialog {...confirmDialogProps} />

            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', maxWidth: 640 }}>
                    What people asked by e-mail and what we replied. Auto-reply is <strong>{summary.auto_reply ? 'ON' : 'OFF'}</strong>; AI answers are{' '}
                    <strong>{{ off: 'off', draft: 'drafted for your approval', auto: 'sent automatically when confident' }[summary.ai_answers_mode]}</strong>.{' '}
                    <Link to="/connect" style={{ color: 'var(--gold)' }}>Change in settings</Link>. Nothing is sent unless auto-reply is on or you press Send.
                </div>
                <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
            </div>

            <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Send the waiting replies up to a date</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 12 }}>
                    Choose which received-mail dates to answer, preview who would get an e-mail, then confirm. Anyone already e-mailed from this mailbox recently is skipped.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Mail received from <input type="date" style={input} value={batch.date_from} onChange={e => { setBatch({ ...batch, date_from: e.target.value }); setPreview(null) }} /></label>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>until <input type="date" style={input} value={batch.date_to} onChange={e => { setBatch({ ...batch, date_to: e.target.value }); setPreview(null) }} /></label>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={batch.include_drafts} onChange={e => { setBatch({ ...batch, include_drafts: e.target.checked }); setPreview(null) }} /> include AI drafts not yet approved
                    </label>
                    <button className="btn btn-secondary" disabled={busy} onClick={runPreview}>Preview</button>
                </div>
                {preview && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                        <div><strong>{preview.would_send}</strong> would be sent · <strong>{preview.would_skip}</strong> skipped
                            {Object.keys(preview.skip_reasons || {}).length > 0 && <span style={{ color: 'var(--text-dim)' }}> ({Object.entries(preview.skip_reasons).map(([r, n]) => `${n} ${r}`).join(', ')})</span>}
                        </div>
                        {preview.send_sample.length > 0 && <div style={{ color: 'var(--text-dim)', marginTop: 6 }}>e.g. {preview.send_sample.map(s => s.recipient).join(', ')}{preview.would_send > preview.send_sample.length ? ' …' : ''}</div>}
                        {preview.would_send > 0 && <button className="btn" disabled={busy} onClick={sendBatch} style={{ marginTop: 10, background: 'var(--gold)', color: 'var(--action-fg)', border: 'none', fontWeight: 700 }}><Send size={14} /> Send {preview.would_send} replies</button>}
                    </div>
                )}
            </div>

            <div className="card">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }} role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map(f => {
                        const n = f.key ? summary.by_status?.[f.key] || 0 : Object.values(summary.by_status || {}).reduce((a, b) => a + b, 0)
                        const active = status === f.key
                        return <button key={f.key || 'all'} type="button" aria-pressed={active} onClick={() => setStatus(f.key)}
                            style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid var(--border)', background: active ? 'var(--gold)' : 'transparent', color: active ? 'var(--action-fg)' : (f.danger && n > 0 ? '#fca5a5' : 'var(--text-dim)') }}>
                            {f.label} <span style={{ opacity: 0.8 }}>{n}</span></button>
                    })}
                    <span style={{ width: 1, background: 'var(--border)' }} />
                    {KIND_FILTERS.map(f => (
                        <button key={f.key || 'every'} type="button" aria-pressed={kind === f.key} onClick={() => setKind(f.key)}
                            style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', border: '1px solid var(--border)', background: kind === f.key ? 'var(--gold)' : 'transparent', color: kind === f.key ? 'var(--action-fg)' : 'var(--text-dim)' }}>{f.label}</button>
                    ))}
                </div>
                <form onSubmit={e => { e.preventDefault(); setQuery(search.trim()) }} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-dim)' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search person, question, subject…" style={{ ...input, paddingLeft: 30, width: 280 }} />
                    </div>
                    <button className="btn btn-secondary" type="submit">Search</button>
                </form>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead><tr><th style={th}>Received</th><th style={th}>From</th><th style={th}>They asked</th><th style={th}>We reply</th><th style={th}>Status</th><th style={th} /></tr></thead>
                        <tbody>
                            {data.items.map(row => (
                                <Fragment key={row.id}>
                                    <tr style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fmt(row.received_at)}</td>
                                        <td style={{ padding: '8px 6px' }}>
                                            <div style={{ fontWeight: 600 }}>{row.sender_name || row.candidate_name || '—'}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{row.sender_email}</div>
                                        </td>
                                        <td style={{ padding: '8px 6px', maxWidth: 260 }}>
                                            {row.question ? row.question : <span style={{ color: 'var(--text-dim)' }}>No question - application received{row.mail_subject ? `: ${row.mail_subject}` : ''}</span>}
                                        </td>
                                        <td style={{ padding: '8px 6px', maxWidth: 320 }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: row.is_ai ? 'var(--gold)' : 'var(--text-dim)' }}>{row.kind === 'answer' ? 'AI ANSWER' : row.is_ai ? 'EDITED' : 'TEMPLATE'}</span>
                                            <div style={{ color: 'var(--text-dim)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{row.reply_body}</div>
                                        </td>
                                        <td style={{ padding: '8px 6px' }}>
                                            <StatusChip status={row.status} />
                                            {row.last_error && <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: 4, maxWidth: 180 }}>{row.last_error}</div>}
                                            {row.status === 'sent' && <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: 4 }}>{fmt(row.sent_at)} · {row.sent_by}</div>}
                                        </td>
                                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                                            {row.status !== 'sent' && <button className="btn btn-secondary" onClick={() => open(row)}><Pencil size={13} /> {openId === row.id ? 'Close' : 'View / edit'}</button>}
                                        </td>
                                    </tr>
                                    {openId === row.id && (
                                        <tr key={`${row.id}-detail`} style={{ background: 'rgba(0,0,0,0.12)' }}>
                                            <td colSpan={6} style={{ padding: 14 }}>
                                                {row.inbound_text && <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Their message</div>
                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem', padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>{row.inbound_text}</div>
                                                </div>}
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Our reply to {row.recipient} — subject: {row.reply_subject}</div>
                                                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={9} style={{ ...input, width: '100%', fontFamily: 'inherit', marginTop: 4 }} />
                                                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                                    <button className="btn btn-secondary" disabled={busy} onClick={() => save(row)}>Save text</button>
                                                    {row.status === 'draft' && <button className="btn btn-secondary" disabled={busy} onClick={() => approve(row)}><Check size={14} /> Approve</button>}
                                                    <button className="btn" disabled={busy} onClick={() => send(row)} style={{ background: 'var(--gold)', color: 'var(--action-fg)', border: 'none', fontWeight: 700 }}><Send size={14} /> Send now</button>
                                                    <button className="btn btn-secondary" disabled={busy} onClick={() => dismiss(row)}><X size={14} /> Don't reply</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                            {data.items.length === 0 && <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>Nothing here yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    <span>{data.total} conversation(s)</span>
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
