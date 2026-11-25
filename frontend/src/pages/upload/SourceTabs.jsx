import { Link } from 'react-router-dom'
import { Mail, FileSpreadsheet, FileText, UserPlus, Layers, AlertTriangle, SearchCheck } from 'lucide-react'

// Buttons that switch the candidates table between where the data came from. The server does the
// filtering (so it works beyond the first page) and supplies the counts.
export const SOURCE_VIEWS = [
    { key: 'all', label: 'All', icon: Layers, count: s => s.usable },
    { key: 'mail', label: 'Emails', icon: Mail, count: s => s.by_origin?.mail },
    { key: 'excel', label: 'Excel', icon: FileSpreadsheet, count: s => s.by_origin?.excel },
    { key: 'resume', label: 'Resumes', icon: FileText, count: s => s.by_origin?.resume },
    { key: 'manual', label: 'Manual', icon: UserPlus, count: s => s.by_origin?.manual },
]
const STATE_VIEWS = [
    { key: 'review', label: 'Needs review', icon: SearchCheck, count: s => s.by_state?.review },
    { key: 'failed', label: 'Failed', icon: AlertTriangle, count: s => s.by_state?.failed, danger: true },
]

// Query params the API understands for each button.
export function viewParams(view) {
    if (view === 'review' || view === 'failed') return { state: view }
    if (view === 'all') return {}
    return { origin: view }
}

const baseStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
}

export default function SourceTabs({ view, onChange, summary, isStaff }) {
    const render = ({ key, label, icon: Icon, count, danger }) => {
        const n = count(summary)
        const active = view === key
        return (
            <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={active}
                style={{
                    ...baseStyle,
                    ...(active ? { background: 'var(--gold)', color: 'var(--action-fg)', borderColor: 'var(--gold)' } : {}),
                    ...(danger && !active && n > 0 ? { color: '#fca5a5', borderColor: 'rgba(252,165,165,0.4)' } : {}),
                }}
            >
                <Icon size={14} /> {label}
                {n !== undefined && n !== null && (
                    <span style={{
                        minWidth: 20, padding: '0 6px', borderRadius: 999, fontSize: '0.7rem', textAlign: 'center',
                        background: active ? 'rgba(0,0,0,0.18)' : 'var(--input-bg)',
                    }}>{n}</span>
                )}
            </button>
        )
    }

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }} role="group" aria-label="Filter candidates by source">
            {SOURCE_VIEWS.map(render)}
            <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} aria-hidden="true" />
            {STATE_VIEWS.map(render)}
            {isStaff && view === 'mail' && (
                <Link to="/mail" style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--gold)' }}>Open Mail Inbox (every mail, with received date) →</Link>
            )}
            {isStaff && view === 'excel' && (
                <Link to="/imports" style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--gold)' }}>Open Excel Imports (per-file results) →</Link>
            )}
        </div>
    )
}
