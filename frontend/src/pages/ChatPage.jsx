import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { Send, Bot, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import apiClient from '../api/client'
import SkillBadges from '../components/shared/SkillBadges'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import CandidateDetailsModal from '../components/shared/CandidateDetailsModal'
import { TH, TD_BASE } from '../hooks/useColumnConfig'

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
                        {/* Was gold at 700/11.8px - a second table-header language
                            next to the Candidates table's --text-muted 800/11.7px
                            (fixed there specifically because gold headers read as
                            wrong). Shared TH now; the sort caret carries the accent
                            instead of the whole label. */}
                        {COL_CONFIG.map(c => (
                            <th key={c.key} style={TH}>
                                <button
                                    type="button"
                                    onClick={() => toggleSort(c.key)}
                                    style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                    {c.label}
                                    {sort.key === c.key && <span style={{ color: 'var(--gold)' }}>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {/* Was <tr onClick> with cursor:pointer as the only
                        affordance - no hover, no focus, no keyboard route, and
                        zebra banding used rgba(--navy-rgb,0.3), which vanishes
                        in light theme the same way the old Candidates-table
                        rows did. The name cell is now a real button (the only
                        clickable target in the row) with the .data-row class
                        (index.css) providing hover/focus/zebra consistently. */}
                    {sortedRows.map((row, i) => (
                        <tr key={row.id ?? i} className="data-row" data-zebra={i % 2 === 0 ? 'even' : undefined}>
                            {COL_CONFIG.map(({ key }) => {
                                const val = row[key]
                                const isExp = key === 'total_experience' || key === 'pega_experience'
                                const content = key === 'skills'
                                    ? <SkillBadges skills={val} />
                                    : isExp
                                        ? (val != null && val !== '' ? `${val} yrs` : '—')
                                        : (val || '—')
                                return (
                                    <td key={key} style={{
                                        ...TD_BASE,
                                        color: key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                        wordBreak: key === 'email' || key === 'current_organization' ? 'break-all' : 'normal',
                                    }}>
                                        {key === 'full_name' && onSelectCandidate ? (
                                            <button
                                                type="button"
                                                onClick={() => onSelectCandidate(row)}
                                                style={{
                                                    all: 'unset', cursor: 'pointer', color: 'var(--gold)', fontWeight: 600,
                                                    textDecoration: 'underline', textUnderlineOffset: 2,
                                                }}
                                            >
                                                {val || '—'}
                                            </button>
                                        ) : key === 'full_name' ? (
                                            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{val || '—'}</span>
                                        ) : content}
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
            {/* User messages no longer get an avatar at all - a right-aligned
                bubble already reads as "you" without a second avatar system.
                The assistant's quiet square (see .msg-avatar.ai) replaces
                what used to be a solid action-orange circle. */}
            {!isUser && <div className="msg-avatar ai">AI</div>}
            <div className="msg-bubble" style={isTable ? {
                maxWidth: '100%', width: '100%', flex: 1,
            } : isError ? {
                background: 'var(--danger-bg)', borderColor: 'rgba(var(--red-rgb), 0.3)',
            } : undefined}>
                {isError ? (
                    // Was indistinguishable from a real answer - no error color,
                    // no icon - which read as the model refusing rather than a
                    // failed request.
                    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger-fg)', fontWeight: 600 }}>
                            <AlertTriangle size={16} /> {msg.content}
                        </span>
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
    const messagesRef = useRef(null)
    const textareaRef = useRef(null)
    const { confirm, confirmDialogProps } = useConfirm()
    const [viewingCandidate, setViewingCandidate] = useState(null)

    useEffect(() => {
        if (user?.username) {
            try {
                // Cap what's persisted - some answers embed full candidate-table
                // dumps, so an unbounded history can grow past localStorage's
                // ~5MB quota and throw (this write was previously unguarded).
                const MAX_PERSISTED_MESSAGES = 100
                const toPersist = messages.length > MAX_PERSISTED_MESSAGES
                    ? messages.slice(messages.length - MAX_PERSISTED_MESSAGES)
                    : messages
                localStorage.setItem(`hire_ai_chat_msgs_${user.username}`, JSON.stringify(toPersist))
            } catch (err) {
                console.warn('Failed to persist chat history (storage quota?):', err)
            }
        }
    }, [messages, user])

    // Was bottomRef.current?.scrollIntoView(...) on every message - since
    // .chat-messages isn't the only scrollable ancestor (.main-content is
    // too), this could scroll the whole app shell rather than just the
    // message list, and it fought anyone who'd scrolled up to reread an
    // earlier answer. Now scrolls only the message container itself, and
    // only when already within ~100px of the bottom.
    useEffect(() => {
        const el = messagesRef.current
        if (!el) return
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distanceFromBottom < 100) {
            el.scrollTop = el.scrollHeight
        }
    }, [messages, loading])

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
                <div className="chat-messages" ref={messagesRef}>
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
                            placeholder="Ask about candidates, experience, skills…"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading} aria-label="Send message">
                            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Send size={16} />}
                        </button>
                    </div>
                    {/* Was a "(Enter to send)" hint baked into the placeholder,
                        which disappears the moment typing starts - exactly when
                        it's still needed. Moved to this persistent line instead. */}
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.5rem' }}>
                        Press Enter to send · Hire AI may make mistakes, always verify important candidate information.
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

