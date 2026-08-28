import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { Send, Bot, User, RotateCcw, Trash2 } from 'lucide-react'
import apiClient from '../api/client'
import SkillBadges from '../components/shared/SkillBadges'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import CandidateDetailsModal from '../components/shared/CandidateDetailsModal'

const SUGGESTIONS = [
    'Show all candidates',
    'Who has Pega experience?',
    'Candidates with 4+ years experience',
    'Who can join immediately?',
    'List candidates with no Pega experience',
]

/* Column config: key → [label, % width]. Keys are the actual
   candidate_metadata column names /api/chat returns (S6.2 fix: this
   previously read `name`/`organization`, which don't exist on the row -
   full_name/current_organization do - so those two columns always
   rendered "—" no matter what the backend sent back). */
const COL_CONFIG = [
    { key: 'full_name', label: 'Name', pct: '14%' },
    { key: 'total_experience', label: 'Total Exp', pct: '8%' },
    { key: 'pega_experience', label: 'Pega Exp', pct: '8%' },
    { key: 'skills', label: 'Skills', pct: '24%' },
    { key: 'ctc', label: 'CTC', pct: '7%' },
    { key: 'notice_period', label: 'Notice', pct: '9%' },
    { key: 'current_organization', label: 'Organization', pct: '14%' },
    { key: 'email', label: 'Email', pct: '16%' },
]

function toCsvValue(v) {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportRowsToCsv(rows) {
    const header = COL_CONFIG.map(c => c.label).join(',')
    const lines = rows.map(row => COL_CONFIG.map(c => toCsvValue(row[c.key])).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-results-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

function CandidateTable({ rows, onSelectCandidate }) {
    const [sort, setSort] = useState({ key: null, dir: 'asc' })
    if (!rows?.length) return null

    const sortedRows = sort.key ? [...rows].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key]
        const cmp = (av == null ? '' : av) < (bv == null ? '' : bv) ? -1 : (av == null ? '' : av) > (bv == null ? '' : bv) ? 1 : 0
        return sort.dir === 'asc' ? cmp : -cmp
    }) : rows

    const toggleSort = (key) => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

    return (
        <div style={{ width: '100%', marginTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '4px 9px' }}
                    onClick={() => exportRowsToCsv(sortedRows)}
                >
                    Export CSV
                </button>
            </div>
            <table style={{
                width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse',
                fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
            }}>
                <colgroup>
                    {COL_CONFIG.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                </colgroup>
                <thead>
                    <tr>
                        {COL_CONFIG.map(c => (
                            <th key={c.key} style={{
                                background: 'rgba(var(--navy-rgb), 0.95)', padding: '9px 10px', textAlign: 'left',
                                fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.74rem',
                                color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem',
                                borderBottom: '1px solid var(--border)',
                            }}>
                                <button
                                    type="button"
                                    onClick={() => toggleSort(c.key)}
                                    style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                    {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row, i) => (
                        <tr
                            key={row.id ?? i}
                            onClick={() => onSelectCandidate?.(row)}
                            style={{ background: i % 2 === 0 ? 'rgba(var(--navy-rgb), 0.3)' : 'transparent', cursor: onSelectCandidate ? 'pointer' : 'default' }}
                        >
                            {COL_CONFIG.map(({ key }) => {
                                const val = row[key]
                                const isExp = key === 'total_experience' || key === 'pega_experience'
                                return (
                                    <td key={key} style={{
                                        padding: '9px 10px',
                                        borderBottom: '1px solid rgba(var(--sky-rgb), 0.08)',
                                        verticalAlign: 'top',
                                        color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                        fontWeight: key === 'full_name' ? 600 : undefined,
                                        wordBreak: key === 'email' || key === 'current_organization' ? 'break-all' : 'normal',
                                        whiteSpace: key === 'skills' ? 'normal' : 'normal',
                                    }}>
                                        {key === 'skills'
                                            ? <SkillBadges skills={val} />
                                            : isExp
                                                ? (val != null && val !== '' ? `${val} yrs` : '—')
                                                : (val || '—')}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}


function Message({ msg, onRetry, onSelectCandidate }) {
    const isUser = msg.role === 'user'
    const isTable = msg.type === 'table'
    const isError = msg.type === 'error'
    return (
        <div className={`message ${isUser ? 'user' : 'ai'}`}>
            <div className={`msg-avatar ${isUser ? 'user-av' : 'ai'}`}>
                {isUser ? <User size={16} /> : 'AI'}
            </div>
            <div className="msg-bubble" style={isTable ? {
                maxWidth: '100%', width: '100%', flex: 1,
            } : undefined}>
                {isError ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span>{msg.content}</span>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '5px 10px', gap: 6 }}
                            onClick={() => onRetry?.(msg.retryText)}
                        >
                            <RotateCcw size={14} /> Retry
                        </button>
                    </div>
                ) : isTable ? (
                    <>
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                            {msg.answer}
                        </div>
                        <CandidateTable rows={msg.rows} onSelectCandidate={onSelectCandidate} />
                    </>
                ) : (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                )}
            </div>
        </div>
    )
}

function TypingIndicator() {
    return (
        <div className="message ai">
            <div className="msg-avatar ai">
                AI
            </div>
            <div className="msg-bubble">
                <div className="typing-dots">
                    <span /><span /><span />
                </div>
            </div>
        </div>
    )
}

export default function ChatPage() {
    const { user } = useOutletContext()
    const [messages, setMessages] = useState(() => {
        try {
            const saved = localStorage.getItem(`hire_ai_chat_msgs_${user?.username || ''}`)
            return saved ? JSON.parse(saved) : []
        } catch {
            return []
        }
    })
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)
    const { confirm, confirmDialogProps } = useConfirm()
    const [viewingCandidate, setViewingCandidate] = useState(null)

    useEffect(() => {
        if (user?.username) {
            localStorage.setItem(`hire_ai_chat_msgs_${user.username}`, JSON.stringify(messages))
        }
    }, [messages, user])

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

    // S6.5: auto-grow the textarea up to the CSS max-height (120px) instead
    // of scrolling inside a fixed 24px box.
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }, [input])

    const handleClearChat = async () => {
        if (!await confirm({
            title: 'Clear conversation?',
            message: 'This deletes every message in this chat. It cannot be undone.',
            confirmLabel: 'Clear',
        })) return
        setMessages([])
        if (user?.username) localStorage.removeItem(`hire_ai_chat_msgs_${user.username}`)
    }

    const sendMessage = async (text) => {
        const content = (text || input).trim()
        if (!content || loading) return
        setInput('')
        setMessages(prev => [...prev, { role: 'user', type: 'text', content }])
        setLoading(true)

        try {
            const { data } = await apiClient.post('/api/chat', { message: content })
            setMessages(prev => [
                ...prev,
                data.type === 'table'
                    ? { role: 'ai', type: 'table', answer: data.answer, rows: data.rows }
                    : { role: 'ai', type: 'text', content: data.answer }
            ])
        } catch (err) {
            console.error('Chat request failed:', err)
            setMessages(prev => [...prev, { role: 'ai', type: 'error', content: 'Something went wrong answering that.', retryText: content }])
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    }

    return (
        <div className="chat-layout" style={{ padding: 0, flex: 1, minHeight: 0 }}>
            <div className="chat-main">
                {messages.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 2rem 0' }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '5px 10px', gap: 6, display: 'inline-flex', alignItems: 'center' }}
                            onClick={handleClearChat}
                        >
                            <Trash2 size={13} /> Clear conversation
                        </button>
                    </div>
                )}
                {/* Messages */}
                <div className="chat-messages">
                    {messages.length === 0 && !loading ? (
                        <div className="chat-empty">
                            <div className="chat-empty-icon"><Bot size={28} /></div>
                            <div className="chat-empty-title">Chat with Hire AI</div>
                            <div className="chat-empty-sub">
                                Ask me anything about your candidates — I'll show results in a table when possible.
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => <Message key={i} msg={msg} onRetry={sendMessage} onSelectCandidate={setViewingCandidate} />)
                    )}
                    {loading && <TypingIndicator />}
                    <div ref={bottomRef} />
                </div>

                {/* Suggestion Chips - kept visible past the first message (S6.3)
                    so they stay discoverable, not just at zero state. */}
                {!loading && (
                    <div className="suggestion-chips">
                        {SUGGESTIONS.map(s => (
                            <button key={s} className="chip" onClick={() => sendMessage(s)}>{s}</button>
                        ))}
                    </div>
                )}

                {/* Input Bar */}
                <div className="chat-input-bar">
                    <div className="chat-input-wrap">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            className="chat-textarea"
                            placeholder="Ask about candidates, experience, skills…  (Enter to send)"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading} aria-label="Send message">
                            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Send size={16} />}
                        </button>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.5rem' }}>
                        Hire AI may make mistakes — always verify important candidate information.
                    </p>
                </div>
            </div>
            <ConfirmDialog {...confirmDialogProps} />
            {viewingCandidate && (
                <CandidateDetailsModal candidate={viewingCandidate} onClose={() => setViewingCandidate(null)} />
            )}
        </div>
    )
}

