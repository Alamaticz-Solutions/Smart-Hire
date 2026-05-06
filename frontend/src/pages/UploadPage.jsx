import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { Upload, Trash2, RefreshCw, X, Download } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'

const API_URL = import.meta.env.VITE_API_URL || 'https://resume-2-34ki.onrender.com';

/* ─── Single chip ─────────────────────────────────────────────────────────── */
function Chip({ text }) {
    return (
        <span style={{
            background: 'rgba(33,158,188,0.12)', border: '1px solid rgba(33,158,188,0.25)',
            borderRadius: 5, padding: '2px 7px', fontSize: '0.73rem',
            color: 'var(--sky-dim)', whiteSpace: 'nowrap', lineHeight: '1.7',
            display: 'inline-block', maxWidth: '100%', overflow: 'hidden',
            textOverflow: 'ellipsis',
        }}>{text}</span>
    )
}

/* ─── Collapsible popup cell ──────────────────────────────────────────────── */
function ExpandableCell({ value, onEdit }) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const btnRef = useRef(null)

    const items = value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []

    const openPopup = (e) => {
        e.stopPropagation()
        const rect = (btnRef.current || e.currentTarget).getBoundingClientRect()
        const POPUP_H = 230  // estimated popup height
        const POPUP_W = 310  // popup width

        // If not enough space below → show above the button
        const top = (rect.bottom + POPUP_H + 6 > window.innerHeight)
            ? rect.top - POPUP_H - 6
            : rect.bottom + 6

        // Clamp left so popup doesn't go off the right edge
        const left = Math.min(rect.left, window.innerWidth - POPUP_W - 10)

        setPos({ top, left })
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        document.addEventListener('click', close)
        return () => document.removeEventListener('click', close)
    }, [open])

    if (items.length === 0) return <span style={{ opacity: 0.35 }}>—</span>

    return (
        <>
            {/* Always inside the td — compact single row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                <span style={{
                    background: 'rgba(33,158,188,0.12)', border: '1px solid rgba(33,158,188,0.25)',
                    borderRadius: 5, padding: '2px 7px', fontSize: '0.73rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', lineHeight: '1.7', maxWidth: 'calc(100% - 64px)',
                    display: 'inline-block',
                }}>{items[0]}</span>

                {items.length > 1 && (
                    <span ref={btnRef}
                        onClick={openPopup}
                        style={{
                            background: 'rgba(255,183,3,0.13)', border: '1px solid rgba(255,183,3,0.35)',
                            borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem',
                            color: 'var(--gold)', cursor: 'pointer', whiteSpace: 'nowrap',
                            lineHeight: '1.7', fontFamily: 'var(--fh)', fontWeight: 700,
                            flexShrink: 0,
                        }}>
                        +{items.length - 1}
                    </span>
                )}
            </div>

            {/* Popup — fixed to viewport, never inside table layout */}
            {open && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
                        background: 'rgba(1,22,39,0.98)', border: '1px solid rgba(33,158,188,0.4)',
                        borderRadius: 12, padding: '14px 16px', width: 310,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{
                            fontSize: '0.74rem', color: 'var(--gold)', fontFamily: 'var(--fh)',
                            fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05rem'
                        }}>
                            All ({items.length})
                        </span>
                        <button onClick={() => setOpen(false)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2 }}>
                            <X size={14} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                        {items.map((s, i) => <Chip key={i} text={s} />)}
                    </div>

                    <div style={{
                        marginTop: 10, borderTop: '1px solid rgba(33,158,188,0.1)',
                        paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(142,202,230,0.4)' }}>
                            Double-click cell to edit full text
                        </span>
                        <button onClick={() => { setOpen(false); onEdit() }}
                            style={{
                                background: 'rgba(255,183,3,0.1)', border: '1px solid rgba(255,183,3,0.3)',
                                borderRadius: 6, color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer',
                                padding: '3px 10px', fontFamily: 'var(--fh)', fontWeight: 700
                            }}>
                            ✏ Edit
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

/* ─── Column config ───────────────────────────────────────────────────────── */
const BASE_WIDTHS = {
    full_name: '12%', total_experience: '7%', pega_experience: '7%',
    skills: '13%', certifications: '12%', ctc: '6%', notice_period: '7%',
    current_organization: '11%', email: '13%', phone: '8%', linkedin: '8%'
}

const TH = {
    padding: '11px 10px',
    textAlign: 'left',
    fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.73rem',
    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05rem',
    borderBottom: '2px solid var(--border)', background: 'rgba(2,48,71,0.97)',
    /* prevent th text from overflowing into next header */
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
}

const TD_BASE = {
    padding: '10px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid rgba(33,158,188,0.07)',
    /* ALL cells clip — nothing bleeds into adjacent column */
    overflow: 'hidden',
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function UploadPage() {
    const [candidates, setCandidates] = useState([])
    const [progress, setProgress] = useState([])
    const [toast, setToast] = useState(null)
    const [editCell, setEditCell] = useState(null)
    const [editVal, setEditVal] = useState('')
    const [cols, setCols] = useState([])
    const [showAddCol, setShowAddCol] = useState(false)
    const [newColForm, setNewColForm] = useState({ label: '', desc: '' })
    const [viewingPdf, setViewingPdf] = useState(null)

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
    const load = () => axios.get('https://resume-2-34ki.onrender.com/api/candidates').then(r => setCandidates(r.data)).catch(() => { })
    const loadCols = () => axios.get('https://resume-2-34ki.onrender.com/api/columns').then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: BASE_WIDTHS[c.col_key] || '10%', col_key: c.col_key, col_label: c.col_label }))
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '10%', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        setCols([...base, ...custom, { key: '_del', label: '', pct: '4%' }])
    }).catch(() => { })

    useEffect(() => { load(); loadCols() }, [])

    // Polling mechanism to auto-refresh the table when resumes are processing in the background
    useEffect(() => {
        const hasProcessing = candidates.some(c => c.full_name && c.full_name.includes('Processing'));
        if (hasProcessing) {
            const timer = setInterval(() => {
                load();
            }, 3000);
            return () => clearInterval(timer);
        }
    }, [candidates]);

    const handleDeleteCol = async (col_key) => {
        if (!window.confirm('Delete this custom column?')) return
        try {
            await axios.delete(`/api/columns/${col_key}`)
            showToast('Column deleted')
            loadCols()
        } catch (e) { showToast(e.response?.data?.detail || 'Delete failed', 'error') }
    }

    const handleAddCol = async () => {
        if (!newColForm.label || !newColForm.desc) return showToast('Please fill all fields', 'error')
        try {
            const col_key = newColForm.label.replace(/[^a-zA-Z0-9_]/g, '').replace(/\s+/g, '_').toLowerCase()
            await axios.post('https://resume-2-34ki.onrender.com/api/columns', { col_key, col_label: newColForm.label, description: newColForm.desc })
            setShowAddCol(false)
            setNewColForm({ label: '', desc: '' })
            loadCols()
            showToast('Column added!')
        } catch (e) { showToast(e.response?.data?.detail || 'Add failed', 'error') }
    }

    const onDrop = useCallback(async (files) => {
        if (!files.length) return
        setProgress(files.map(f => ({ name: f.name, status: 'pending', percent: 0 })))
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData(); fd.append('file', files[i])
            setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'processing', percent: 10 } : x))
            try {
                await axios.post('https://resume-2-34ki.onrender.com/api/upload', fd, {
                    onUploadProgress: ev => {
                        const pct = Math.round((ev.loaded / ev.total) * 70)
                        setProgress(p => p.map((x, idx) => idx === i ? { ...x, percent: 10 + pct } : x))
                    }
                })
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'done', percent: 100 } : x))
            } catch {
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'error', percent: 0 } : x))
            }
        }
        load(); showToast(`${files.length} resume(s) analyzed!`)
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        multiple: true,
    })

    const startEdit = (ri, col, val) => { setEditCell({ row: ri, col }); setEditVal(String(val || '')) }
    const saveEdit = async (ri) => {
        const c = candidates[ri]; if (!c?.id) { setEditCell(null); return }
        try {
            await axios.put(`/api/candidates/${c.id}`, { [editCell.col]: editVal })
            setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: editVal } : row))
            showToast('Saved!')
        } catch { showToast('Save failed', 'error') }
        setEditCell(null)
    }
    const del = async (id) => {
        if (!window.confirm('Delete this candidate?')) return
        try { await axios.delete(`/api/candidates/${id}`); setCandidates(p => p.filter(c => c.id !== id)); showToast('Deleted') }
        catch { showToast('Delete failed', 'error') }
    }

    return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Drop Zone */}
            <div className="card">
                <div className="card-title"><Upload size={17} /> Upload Resumes</div>
                <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                    <input {...getInputProps()} />
                    <div className="dropzone-icon">📄</div>
                    <div className="dropzone-text">
                        {isDragActive ? <strong>Drop here…</strong>
                            : <><strong>Drag & drop</strong> PDF / DOCX resumes, or click to browse</>}
                    </div>
                </div>
                {progress.length > 0 && (
                    <div style={{ marginTop: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {progress.map((p, i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{p.name}</span>
                                    <span className={`badge ${p.status === 'done' ? 'badge-green' : p.status === 'error' ? 'badge-red' : 'badge-sky'}`}>
                                        {p.status === 'done' ? '✓ Done' : p.status === 'error' ? '✗ Error' : 'Processing…'}
                                    </span>
                                </div>
                                <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.percent}%` }} /></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="card" style={{ flex: 1 }}>
                <div className="section-header">
                    <div className="section-title">👥 Candidate Details</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-secondary" onClick={() => setShowAddCol(true)} style={{ gap: 6, color: 'var(--gold)', borderColor: 'rgba(255,183,3,0.3)' }}>
                            <span style={{ fontWeight: 900 }}>+</span> Add Column
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ gap: 6 }}
                            onClick={() => exportToExcel(formatCandidatesForExcel(candidates, cols.filter(c => c.key !== '_del')), 'all_candidates_details.xlsx')}
                        >
                            <Download size={14} /> Download Excel
                        </button>
                        <button className="btn btn-secondary" onClick={() => { load(); loadCols(); }} style={{ gap: 6 }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                </div>

                {candidates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
                        <p>No candidates yet. Upload resumes to get started.</p>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <table style={{ width: '100%', minWidth: Math.max(860, cols.length * 80), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                <colgroup>
                                    {cols.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                                </colgroup>
                                <thead>
                                    <tr>
                                        {cols.map(c => (
                                            <th key={c.key} style={TH} title={c.label}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                                                    {c.isCustom && (
                                                        <button
                                                            onClick={() => handleDeleteCol(c.key)}
                                                            style={{ background: 'none', border: 'none', color: '#ef233c', cursor: 'pointer', padding: 0, marginLeft: 5, display: 'flex' }}
                                                            title="Delete Column"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {candidates.map((row, ri) => (
                                        <tr key={row.id || ri}
                                            style={{ background: ri % 2 === 0 ? 'rgba(2,48,71,0.25)' : 'transparent', transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(33,158,188,0.07)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? 'rgba(2,48,71,0.25)' : 'transparent'}
                                        >
                                            {cols.map(({ key }) => {
                                                /* ── Delete button ── */
                                                if (key === '_del') return (
                                                    <td key={key} style={{ ...TD_BASE, textAlign: 'center' }}>
                                                        <button className="btn btn-danger" style={{ padding: '4px 7px' }} onClick={() => del(row.id)}>
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </td>
                                                )

                                                const isEditing = editCell?.row === ri && editCell?.col === key
                                                const val = row[key] ?? ''
                                                const isExp = key === 'total_experience' || key === 'pega_experience'
                                                const isExpandable = key === 'skills' || key === 'certifications'

                                                /* ── Inline edit mode ── */
                                                if (isEditing) return (
                                                    <td key={key} style={TD_BASE}>
                                                        <input autoFocus value={editVal}
                                                            onChange={e => setEditVal(e.target.value)}
                                                            onBlur={() => saveEdit(ri)}
                                                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(ri); if (e.key === 'Escape') setEditCell(null) }}
                                                            style={{
                                                                background: 'rgba(255,183,3,0.1)', border: '1px solid var(--gold)',
                                                                borderRadius: 6, padding: '4px 8px', color: '#fff', width: '100%',
                                                                fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                                            }}
                                                        />
                                                    </td>
                                                )

                                                /* ── Expandable (skills / certs) — td stays overflow:hidden ── */
                                                if (isExpandable) return (
                                                    <td key={key} style={{ ...TD_BASE }} onDoubleClick={() => startEdit(ri, key, val)}>
                                                        <ExpandableCell value={val} onEdit={() => startEdit(ri, key, val)} />
                                                    </td>
                                                )

                                                /* ── Regular cells ── */
                                                const display = isExp ? (val !== '' && val != null ? `${val} yrs` : '—') : (val || '—')
                                                return (
                                                    <td key={key} onDoubleClick={() => startEdit(ri, key, val)} style={{
                                                        ...TD_BASE,
                                                        color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                                        fontWeight: key === 'full_name' ? 700 : undefined,
                                                        /* overflow already hidden via TD_BASE — text clips cleanly */
                                                        whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                                            ? 'normal' : 'nowrap',
                                                        wordBreak: key === 'email' ? 'break-all' : undefined,
                                                        cursor: 'text',
                                                    }}>
                                                        {key === 'full_name' && row.filename ? (
                                                            <span
                                                                onClick={() => setViewingPdf({ url: `/static/${row.filename}`, name: row.full_name })}
                                                                style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed transparent', transition: 'all 0.2s', cursor: 'pointer' }}
                                                                onMouseEnter={e => e.currentTarget.style.borderBottomColor = 'var(--gold)'}
                                                                onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                                                                title={`View ${row.filename}`}
                                                            >
                                                                {String(display)}
                                                            </span>
                                                        ) : String(display)}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'rgba(142,202,230,0.38)' }}>
                            💡 Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click any cell to edit
                        </p>
                    </>
                )}
            </div>

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.msg}</div>
                </div>
            )}

            {showAddCol && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Custom Column</h3>
                            <button onClick={() => setShowAddCol(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--sky-dim)' }}>Column Name / Label</label>
                                <input
                                    autoFocus
                                    value={newColForm.label} onChange={e => setNewColForm(p => ({ ...p, label: e.target.value }))}
                                    placeholder="e.g. Current Location"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(1,22,39,0.5)', color: '#fff', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--sky-dim)' }}>Description / AI Instructions</label>
                                <textarea
                                    value={newColForm.desc} onChange={e => setNewColForm(p => ({ ...p, desc: e.target.value }))}
                                    placeholder="e.g. City and State where candidate is located"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(1,22,39,0.5)', color: '#fff', minHeight: 80, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                            <button className="btn" onClick={handleAddCol} style={{ background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold' }}>
                                Create Column
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Resume Viewer Modal */}
            {viewingPdf && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }} onClick={() => setViewingPdf(null)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ 
                        width: '90%', maxWidth: 1000, height: '90vh', 
                        display: 'flex', flexDirection: 'column', padding: 0, 
                        overflow: 'hidden', border: '1px solid var(--border)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                            padding: '16px 24px', background: 'rgba(2,48,71,0.98)', borderBottom: '1px solid var(--border)' 
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.05rem' }}>
                                <span style={{fontSize: '1.2rem', opacity: 0.8}}>📄</span> {viewingPdf.name}
                            </h3>
                            <button onClick={() => setViewingPdf(null)} style={{ 
                                background: 'rgba(255,183,3,0.1)', border: '1px solid rgba(255,183,3,0.3)', 
                                color: 'var(--gold)', cursor: 'pointer', padding: 6, borderRadius: '8px', 
                                display: 'flex', transition: 'all 0.2s' 
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,183,3,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,183,3,0.1)'}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <iframe 
                            src={`${viewingPdf.url}#view=FitH`} 
                            style={{ width: '100%', flex: 1, border: 'none', background: '#525659' }} 
                            title="Resume Viewer"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

