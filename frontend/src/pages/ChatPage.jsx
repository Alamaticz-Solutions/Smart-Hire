import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { Send, Bot, User } from 'lucide-react'

const SUGGESTIONS = [
    'Show all candidates',
    'Who has Pega experience?',
    'Candidates with 4+ years experience',
    'Who can join immediately?',
    'List candidates with no Pega experience',
]

function SkillBadges({ value }) {
    if (!value) return <span style={{ opacity: 0.4 }}>—</span>
    const list = String(value).split(',').map(s => s.trim()).filter(Boolean)
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {list.map((s, i) => (
                <span key={i} style={{
                    background: 'rgba(33,158,188,0.15)', border: '1px solid rgba(33,158,188,0.3)',
                    borderRadius: 5, padding: '1px 6px', fontSize: '0.72rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', lineHeight: '1.6',
                }}>{s}</span>
            ))}
        </div>
    )
}

/* Column config: key → [label, % width] */
const COL_CONFIG = [
    { key: 'name', label: 'Name', pct: '14%' },
    { key: 'total_experience', label: 'Total Exp', pct: '8%' },
    { key: 'pega_experience', label: 'Pega Exp', pct: '8%' },
    { key: 'skills', label: 'Skills', pct: '24%' },
    { key: 'ctc', label: 'CTC', pct: '7%' },
    { key: 'notice_period', label: 'Notice', pct: '9%' },
    { key: 'organization', label: 'Organization', pct: '14%' },
    { key: 'email', label: 'Email', pct: '16%' },
]

function CandidateTable({ rows }) {
    if (!rows?.length) return null
    return (
        <div style={{ width: '100%', marginTop: '0.8rem' }}>
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
                                background: 'rgba(2,48,71,0.95)', padding: '9px 10px', textAlign: 'left',
                                fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.74rem',
                                color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem',
                                borderBottom: '1px solid var(--border)',
                            }}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(2,48,71,0.3)' : 'transparent' }}>
                            {COL_CONFIG.map(({ key }) => {
                                const val = row[key]
                                const isExp = key === 'total_experience' || key === 'pega_experience'
                                return (
                                    <td key={key} style={{
                                        padding: '9px 10px',
                                        borderBottom: '1px solid rgba(33,158,188,0.08)',
                                        verticalAlign: 'top',
                                        color: key === 'name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                        fontWeight: key === 'name' ? 600 : undefined,
                                        wordBreak: key === 'email' || key === 'organization' ? 'break-all' : 'normal',
                                        whiteSpace: key === 'skills' ? 'normal' : 'normal',
                                    }}>
                                        {key === 'skills'
                                            ? <SkillBadges value={val} />
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


function Message({ msg }) {
    const isUser = msg.role === 'user'
    const isTable = msg.type === 'table'
    return (
        <div className={`message ${isUser ? 'user' : 'ai'}`}>
            <div className={`msg-avatar ${isUser ? 'user-av' : 'ai'}`}>
                {isUser ? <User size={16} /> : 'AI'}
            </div>
            <div className="msg-bubble" style={isTable ? {
                maxWidth: '100%', width: '100%', flex: 1,
            } : undefined}>
                {isTable ? (
                    <>
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                            {msg.answer}
                        </div>
                        <CandidateTable rows={msg.rows} />
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
            <div className="msg-avatar ai" style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg,var(--primary),var(--gold))', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--navy-dark)', fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.85rem'
            }}>
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
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

    const sendMessage = async (text) => {
        const content = (text || input).trim()
        if (!content || loading) return
        setInput('')
        setMessages(prev => [...prev, { role: 'user', type: 'text', content }])
        setLoading(true)

        try {
            const { data } = await axios.post('https://resume-2-34ki.onrender.com/api/chat', { message: content })
            setMessages(prev => [
                ...prev,
                data.type === 'table'
                    ? { role: 'ai', type: 'table', answer: data.answer, rows: data.rows }
                    : { role: 'ai', type: 'text', content: data.answer }
            ])
        } catch {
            setMessages(prev => [...prev, { role: 'ai', type: 'text', content: '⚠️ Something went wrong. Please try again.' }])
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
                {/* Messages */}
                <div className="chat-messages">
                    {messages.length === 0 && !loading ? (
                        <div className="chat-empty">
                            <div className="chat-empty-icon">🤖</div>
                            <div className="chat-empty-title">Chat with Hire AI</div>
                            <div className="chat-empty-sub">
                                Ask me anything about your candidates — I'll show results in a table when possible.
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => <Message key={i} msg={msg} />)
                    )}
                    {loading && <TypingIndicator />}
                    <div ref={bottomRef} />
                </div>

                {/* Suggestion Chips */}
                {messages.length === 0 && (
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
                        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading}>
                            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Send size={17} />}
                        </button>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.73rem', color: 'rgba(142,202,230,0.4)', marginTop: '0.5rem' }}>
                        Hire AI may make mistakes — always verify important candidate information.
                    </p>
                </div>
            </div>
        </div>
    )
}

