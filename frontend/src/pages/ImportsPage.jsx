import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Download, RefreshCw, Undo2, Eye } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { formatApiError } from '../utils/apiError'

const STATUS = {
    running: { fg: '#facc15', label: 'Running' },
    done: { fg: '#4ade80', label: 'Done' },
    failed: { fg: '#f87171', label: 'Failed' },
    undone: { fg: '#94a3b8', label: 'Undone' },
}
const ITEM_COLOR = { imported: '#4ade80', updated: '#60a5fa', skipped: '#facc15', error: '#f87171' }

const fmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? iso : `${iso}Z`)
    return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

async function saveBlob(res, filename) {
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
}

export default function ImportsPage() {
    const { user } = useOutletContext()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [batches, setBatches] = useState([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(null)        // batch id whose rows are shown
    const [detail, setDetail] = useState(null)
    const [itemFilter, setItemFilter] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setBatches((await apiClient.get('/api/imports')).data)
        } catch (err) {
            showToast(formatApiError(err, 'Could not load the imports.'), 'error')
        } finally {
            setLoading(false)
        }
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load() }, [load])
    // keep running imports fresh
    useEffect(() => {
        if (!batches.some(b => b.status === 'running')) return undefined
        const t = setInterval(load, 4000)
        return () => clearInterval(t)
    }, [batches, load])

    useEffect(() => {
        if (!open) { setDetail(null); return }
        apiClient.get(`/api/imports/${open}/items`, { params: itemFilter ? { status: itemFilter } : {} })
            .then(r => setDetail(r.data))
            .catch(err => showToast(formatApiError(err), 'error'))
    }, [open, itemFilter])  // eslint-disable-line react-hooks/exhaustive-deps

    const report = async (b) => {
        try { saveBlob(await apiClient.get(`/api/imports/${b.id}/report.xlsx`, { responseType: 'blob' }), `import_${b.id}_report.xlsx`) }
        catch (err) { showToast(formatApiError(err, 'Download failed.'), 'error') }
    }

    const undo = async (b) => {
        const ok = await confirm({
            title: 'Undo this import?',
            message: `This removes the ${b.imported} candidate(s) created from "${b.name}". Rows that only updated existing candidates are kept.`,
            confirmLabel: 'Undo import', danger: true,
        })
        if (!ok) return
        try {
            const res = await apiClient.post(`/api/imports/${b.id}/undo`)
            showToast(`${res.data.removed} candidate(s) removed.`)
            load()
        } catch (err) { showToast(formatApiError(err, 'Could not undo the import.'), 'error') }
    }

    if (!(user?.is_admin === 1 || user?.is_hr === 1)) return null
    const th = { padding: '8px 6px', textAlign: 'left', color: 'var(--text-subtle)', fontSize: '0.72rem', textTransform: 'uppercase' }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            <ConfirmDialog {...confirmDialogProps} />

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                        Every spreadsheet uploaded on the <Link to="/upload" style={{ color: 'var(--gold)' }}>Candidates</Link> page is listed here with what happened to each row.
                    </div>
                    <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr>
                                <th style={th}>File</th><th style={th}>Uploaded</th><th style={th}>By</th><th style={th}>Status</th>
                                <th style={th}>Imported</th><th style={th}>Updated</th><th style={th}>Skipped</th><th style={th}>Errors</th><th style={th} />
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map(b => (
                                <tr key={b.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                                    <td style={{ padding: '8px 6px' }}>
                                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                                        {b.note && <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', maxWidth: 360 }}>{b.note}</div>}
                                    </td>
                                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fmt(b.created_at)}</td>
                                    <td style={{ padding: '8px 6px' }}>{b.created_by}</td>
                                    <td style={{ padding: '8px 6px', color: (STATUS[b.status] || {}).fg, fontWeight: 700 }}>{(STATUS[b.status] || {}).label || b.status}</td>
                                    <td style={{ padding: '8px 6px' }}>{b.imported}</td>
                                    <td style={{ padding: '8px 6px' }}>{b.updated}</td>
                                    <td style={{ padding: '8px 6px' }}>{b.skipped}</td>
                                    <td style={{ padding: '8px 6px', color: b.errors ? '#f87171' : undefined }}>{b.errors}</td>
                                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                                        <button className="btn btn-secondary" onClick={() => { setItemFilter(''); setOpen(open === b.id ? null : b.id) }}><Eye size={13} /> Rows</button>{' '}
                                        <button className="btn btn-secondary" onClick={() => report(b)}><Download size={13} /> Report</button>{' '}
                                        {b.status === 'done' && b.imported > 0 && <button className="btn btn-secondary" onClick={() => undo(b)}><Undo2 size={13} /> Undo</button>}
                                    </td>
                                </tr>
                            ))}
                            {!loading && batches.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>No spreadsheets uploaded yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {detail && (
                <div className="card">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <strong>{detail.batch.name}</strong>
                        {['', 'imported', 'updated', 'skipped', 'error'].map(s => (
                            <button key={s || 'all'} onClick={() => setItemFilter(s)} aria-pressed={itemFilter === s}
                                style={{ padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit',
                                    border: '1px solid var(--border)', background: itemFilter === s ? 'var(--gold)' : 'transparent', color: itemFilter === s ? 'var(--action-fg)' : 'var(--text-dim)' }}>
                                {s || 'All'}
                            </button>
                        ))}
                    </div>
                    <div style={{ maxHeight: 360, overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead><tr><th style={th}>Sheet</th><th style={th}>Row</th><th style={th}>Candidate</th><th style={th}>Result</th><th style={th}>Why</th></tr></thead>
                            <tbody>
                                {detail.items.map(i => (
                                    <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px' }}>{i.sheet || '—'}</td>
                                        <td style={{ padding: '6px' }}>{i.row_no ?? '—'}</td>
                                        <td style={{ padding: '6px' }}>{i.candidate_id ? <Link to={`/candidates/${i.candidate_id}`} style={{ color: 'var(--gold)' }}>{i.label}</Link> : i.label}</td>
                                        <td style={{ padding: '6px', color: ITEM_COLOR[i.status], fontWeight: 700 }}>{i.status}</td>
                                        <td style={{ padding: '6px', color: 'var(--text-dim)' }}>{i.reason || ''}</td>
                                    </tr>
                                ))}
                                {detail.items.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>No rows for this filter.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
