import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../api/client'

const fmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? iso : `${iso}Z`)
    return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
const OUTCOME = { imported: 'Imported', follow_up: 'Follow-up', failed: 'Failed', pending_retry: 'Will retry', skipped_automated: 'Skipped', no_resume: 'No resume', legacy_file: '.doc/.xls', not_pulled: 'Not pulled' }
const OUTCOME_COLOR = { imported: '#4ade80', follow_up: '#60a5fa', failed: '#f87171', pending_retry: '#facc15' }

// Where the data came from and what needs a person: candidates by source, items needing attention, latest mail.
export default function DashboardInsights({ isStaff }) {
    const [summary, setSummary] = useState(null)
    const [mail, setMail] = useState(null)
    const [convo, setConvo] = useState(null)
    const [latest, setLatest] = useState([])

    useEffect(() => {
        apiClient.get('/api/candidates/summary').then(r => setSummary(r.data)).catch(() => {})
        if (!isStaff) return
        apiClient.get('/api/mail/summary').then(r => setMail(r.data)).catch(() => {})
        apiClient.get('/api/conversations/summary').then(r => setConvo(r.data)).catch(() => {})
        apiClient.get('/api/mail/messages', { params: { limit: 6 } }).then(r => setLatest(r.data.items)).catch(() => {})
    }, [isStaff])

    if (!summary) return null
    const sources = [
        ['Emails', summary.by_origin?.mail, '/upload?view=mail'], ['Excel', summary.by_origin?.excel, '/upload?view=excel'],
        ['Resumes', summary.by_origin?.resume, '/upload?view=resume'], ['Manual', summary.by_origin?.manual, '/upload?view=manual'],
    ]
    const attention = [
        ['Profiles needing review', summary.by_state?.review, '/upload?view=review'],
        ['Failed mail imports', summary.by_state?.failed, '/upload?view=failed'],
        ...(isStaff ? [
            ['AI answers waiting for approval', convo?.by_status?.draft, '/conversations'],
            ['Replies waiting to send', convo?.by_status?.pending, '/conversations'],
        ] : []),
    ].filter(([, n]) => n)
    const th = { padding: '6px', textAlign: 'left', color: 'var(--text-subtle)', fontSize: '0.7rem', textTransform: 'uppercase' }

    return (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', margin: '16px 0' }}>
            <div className="card">
                <div className="card-title">Where candidates come from</div>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <tbody>
                        {sources.map(([label, n, to]) => (
                            <tr key={label} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 4px' }}><Link to={to} style={{ color: 'var(--text)' }}>{label}</Link></td>
                                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>{n || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {isStaff && mail && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 8 }}>
                    Mailbox: {mail.total} mails logged · poller {{ ok: 'running', stale: 'not reached recently', error: 'has an error', off: 'off' }[mail.poller?.health]} · <Link to="/mail" style={{ color: 'var(--gold)' }}>Mail Inbox</Link>
                </div>}
            </div>

            {attention.length > 0 && (
                <div className="card">
                    <div className="card-title">Needs attention</div>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                        <tbody>
                            {attention.map(([label, n, to]) => (
                                <tr key={label} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 4px' }}><Link to={to} style={{ color: 'var(--text)' }}>{label}</Link></td>
                                    <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, color: '#facc15' }}>{n}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isStaff && latest.length > 0 && (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-title">Latest mail <Link to="/mail" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--gold)' }}>View all</Link></div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={th}>Received</th><th style={th}>From</th><th style={th}>Subject</th><th style={th}>Outcome</th></tr></thead>
                            <tbody>
                                {latest.map(m => (
                                    <tr key={m.msg_uid} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{fmt(m.received_at)}</td>
                                        <td style={{ padding: '6px' }}>{m.sender_name || m.sender_email}</td>
                                        <td style={{ padding: '6px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(no subject)'}</td>
                                        <td style={{ padding: '6px', fontWeight: 700, color: OUTCOME_COLOR[m.outcome] || 'var(--text-dim)' }}>{OUTCOME[m.outcome] || m.outcome}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
