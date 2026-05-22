import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { UploadCloud, Trash2, CheckCircle, FileText, Search, Plus, Filter, Loader, RefreshCw, Download, Upload, X, Check, Eye } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'

const API_URL = import.meta.env.VITE_API_URL || '';

/* ─── Single chip ─────────────────────────────────────────────────────────── */
function Chip({ text }) {
    return (
        <span style={{
            background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
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
    const btnRef = useRef(null)

    const items = value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []

    const openPopup = (e) => {
        e.stopPropagation()
        setOpen(true)
    }

    if (items.length === 0) return <span style={{ opacity: 0.35 }}>—</span>

    return (
        <>
            {/* Always inside the td — compact single row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                <span style={{
                    background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                    borderRadius: 5, padding: '2px 7px', fontSize: '0.73rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', lineHeight: '1.7', maxWidth: 'calc(100% - 64px)',
                    display: 'inline-block',
                }}>{items[0]}</span>

                {items.length > 1 && (
                    <span ref={btnRef}
                        onClick={openPopup}
                        style={{
                            background: 'rgba(var(--gold-rgb), 0.13)', border: '1px solid rgba(var(--gold-rgb), 0.35)',
                            borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem',
                            color: 'var(--gold)', cursor: 'pointer', whiteSpace: 'nowrap',
                            lineHeight: '1.7', fontFamily: 'var(--fh)', fontWeight: 700,
                            flexShrink: 0,
                        }}>
                        +{items.length - 1}
                    </span>
                )}
            </div>

            {/* Centered Modal Popup */}
            {open && (
                <div 
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0, 0, 0, 0.45)', zIndex: 99999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(2px)'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '16px 20px', width: 340, maxWidth: '90%',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{
                                fontSize: '0.78rem', color: 'var(--gold)', fontFamily: 'var(--fh)',
                                fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05rem'
                            }}>
                                All ({items.length})
                            </span>
                            <button onClick={() => setOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                            {items.map((s, i) => <Chip key={i} text={s} />)}
                        </div>

                        <div style={{
                            marginTop: 12, borderTop: '1px solid var(--border)',
                            paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', opacity: 0.7 }}>
                                Double-click cell to edit full text
                            </span>
                            <button onClick={() => { setOpen(false); onEdit() }}
                                style={{
                                    background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                    borderRadius: 6, color: 'var(--gold)', fontSize: '0.75rem', cursor: 'pointer',
                                    padding: '4px 12px', fontFamily: 'var(--fh)', fontWeight: 700
                                }}>
                                ✏ Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

/* ─── Column config ───────────────────────────────────────────────────────── */
const BASE_WIDTHS = {
    full_name: '150px', total_experience: '90px', pega_experience: '90px',
    cdh_exp: '90px', ctc: '100px', expected_ctc: '100px', percentage_hike: '90px',
    candidate_interview_status: '130px', candidate_status: '130px', availability_in_days: '100px', notice_period: '90px',
    phone: '130px', email: '180px', linkedin: '120px', current_location: '120px',
    pref_locations: '120px', current_organization: '150px', current_client: '150px',
    domain: '120px', tier: '90px', certification_version: '100px',
    skills: '200px', certifications: '180px'
}

const TH = {
    padding: '11px 10px',
    textAlign: 'left',
    fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.73rem',
    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05rem',
    borderBottom: '2px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.97)',
    /* prevent th text from overflowing into next header */
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
}

const TD_BASE = {
    padding: '10px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid rgba(var(--sky-rgb), 0.07)',
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
    const [viewingPdf, setViewingPdf] = useState(null)
    const [showFilter, setShowFilter] = useState(false)
    const [filters, setFilters] = useState({ minTotalExp: '', minPegaExp: '', certs: [] })
    const [customFilters, setCustomFilters] = useState([])
    const [columnFilters, setColumnFilters] = useState({})
     const [activeTab, setActiveTab] = useState('all') // 'all' or 'qualified'
    const [newColForm, setNewColForm] = useState({ label: '', desc: '' })
    
    const [showColVisibility, setShowColVisibility] = useState(false)
    const [hiddenColumnKeys, setHiddenColumnKeys] = useState([])
    const [draggedColKey, setDraggedColKey] = useState(null)
    const [dragOverColKey, setDragOverColKey] = useState(null)

    const toggleColumnVisibility = (key) => {
        setHiddenColumnKeys(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        )
    }

    const handleShowAllColumns = () => {
        setHiddenColumnKeys([])
    }

    const handleHideAllColumns = () => {
        setHiddenColumnKeys(cols.filter(c => c.key !== '_actions' && c.key !== 'full_name').map(c => c.key))
    }

    const handleDragStart = (e, key) => {
        setDraggedColKey(key);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
    };

    const handleDragOver = (e, key) => {
        if (key === '_actions') return;
        e.preventDefault();
    };

    const handleDragEnter = (e, key) => {
        if (key === '_actions') return;
        setDragOverColKey(key);
    };

    const handleDragEnd = () => {
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    const handleDrop = (e, targetKey) => {
        e.preventDefault();
        if (!draggedColKey || draggedColKey === targetKey || targetKey === '_actions' || draggedColKey === '_actions') {
            setDraggedColKey(null);
            setDragOverColKey(null);
            return;
        }

        const dragIdx = cols.findIndex(c => c.key === draggedColKey);
        const targetIdx = cols.findIndex(c => c.key === targetKey);

        if (dragIdx !== -1 && targetIdx !== -1) {
            const updatedCols = [...cols];
            const [draggedItem] = updatedCols.splice(dragIdx, 1);
            updatedCols.splice(targetIdx, 0, draggedItem);
            setCols(updatedCols);
        }
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    useEffect(() => {
        if (cols.length > 0) {
            localStorage.setItem('hire_ai_col_order', JSON.stringify(cols.map(c => c.key).filter(k => k !== '_actions')))
        }
    }, [cols])

    useEffect(() => {
        if (!showColVisibility) return;
        const clickAway = () => setShowColVisibility(false);
        const timer = setTimeout(() => {
            document.addEventListener('click', clickAway);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', clickAway);
        };
    }, [showColVisibility]);

    const activeCols = cols.filter(c => c.key === '_actions' || !hiddenColumnKeys.includes(c.key))

    const PEGA_CERTS = ['CSA', 'CSSA', 'LSA', 'CPDC']

    const toggleCert = (cert) => {
        setFilters(prev => ({
            ...prev,
            certs: prev.certs.includes(cert) 
                ? prev.certs.filter(c => c !== cert) 
                : [...prev.certs, cert]
        }))
    }

    const filteredCandidates = candidates.filter(candidate => {
        // Tab Filtering
        if (activeTab === 'qualified' && candidate.is_qualified !== 1) return false;

        const tExp = parseFloat(candidate.total_experience) || 0;
        const pExp = parseFloat(candidate.pega_experience) || 0;
        
        if (filters.minTotalExp !== '' && tExp < parseFloat(filters.minTotalExp)) return false;
        if (filters.minPegaExp !== '' && pExp < parseFloat(filters.minPegaExp)) return false;
        
        if (filters.certs.length > 0) {
            const cStr = (candidate.certifications || '').toLowerCase();
            const hasCerts = filters.certs.some(cert => cStr.includes(cert.toLowerCase()));
            if (!hasCerts) return false;
        }
        
        // Custom Filters
        for (const cf of customFilters) {
            if (cf.col && cf.val) {
                const cVal = String(candidate[cf.col] || '').toLowerCase();
                if (!cVal.includes(cf.val.toLowerCase())) return false;
            }
        }

        // Inline Column Filters
        for (const [colKey, filterVal] of Object.entries(columnFilters)) {
            if (filterVal) {
                const cVal = String(candidate[colKey] || '').toLowerCase();
                if (!cVal.includes(filterVal.toLowerCase())) return false;
            }
        }
        
        return true;
    });

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
    const load = () => axios.get(`${API_URL}/api/candidates`).then(r => setCandidates(r.data)).catch(() => { })
    const loadCols = () => axios.get(`${API_URL}/api/columns`).then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: BASE_WIDTHS[c.col_key] || '120px', col_key: c.col_key, col_label: c.col_label }))
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '120px', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        const allLoaded = [...base, ...custom, { key: '_actions', label: 'Actions', pct: '100px' }]
        
        const savedOrder = localStorage.getItem('hire_ai_col_order')
        if (savedOrder) {
            try {
                const keys = JSON.parse(savedOrder).filter(k => k !== '_actions')
                const ordered = []
                keys.forEach(k => {
                    const found = allLoaded.find(c => c.key === k)
                    if (found) ordered.push(found)
                })
                allLoaded.forEach(c => {
                    if (!ordered.find(o => o.key === c.key)) {
                        if (c.key === '_actions') return
                        ordered.push(c)
                    }
                })
                const actionsCol = allLoaded.find(c => c.key === '_actions')
                if (actionsCol) {
                    ordered.push(actionsCol)
                }
                setCols(ordered)
                return
            } catch (e) { }
        }
        setCols(allLoaded)
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

    const handleDeleteCol = async (col_key, col_label) => {
        const label = col_label || col_key;
        if (!window.confirm(`Are you sure you want to delete the "${label}" column?`)) return
        try {
            await axios.delete(`${API_URL}/api/columns/${col_key}`)
            showToast('Column deleted')
            loadCols()
        } catch (e) { showToast(e.response?.data?.detail || 'Delete failed', 'error') }
    }

    const handleAddCol = async () => {
        if (!newColForm.label || !newColForm.desc) return showToast('Please fill all fields', 'error')
        try {
            const col_key = newColForm.label.replace(/[^a-zA-Z0-9_]/g, '').replace(/\s+/g, '_').toLowerCase()
            await axios.post(`${API_URL}/api/columns`, { col_key, col_label: newColForm.label, description: newColForm.desc })
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
                const res = await axios.post(`${API_URL}/api/upload`, fd, {
                    onUploadProgress: ev => {
                        const pct = Math.round((ev.loaded / ev.total) * 70)
                        setProgress(p => p.map((x, idx) => idx === i ? { ...x, percent: 10 + pct } : x))
                    }
                })
                if (res.data?.status === 'pending_approval') {
                    setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'done', percent: 100, name: x.name + ' (Pending)' } : x))
                    showToast('Resume uploaded. Awaiting Admin Approval.', 'info')
                } else {
                    setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'done', percent: 100 } : x))
                }
            } catch {
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'error', percent: 0 } : x))
            }
        }
        load()
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        multiple: true,
    })

    const startEdit = (ri, col, val) => { setEditCell({ row: ri, col }); setEditVal(String(val || '')) }
    const saveEdit = async (ri) => {
        const c = candidates[ri]; if (!c?.id) { setEditCell(null); return }
        
        let finalVal = editVal;
        if (editCell.col === 'notice_period' || editCell.col === 'availability_in_days') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast(`${editCell.col} must be a number`, 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseInt(finalVal, 10) : '';
        }
        if (editCell.col === 'total_experience' || editCell.col === 'pega_experience' || editCell.col === 'cdh_exp') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast('Experience must be a number', 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseFloat(finalVal) : '';
        }

        try {
            const res = await axios.put(`${API_URL}/api/candidates/${c.id}`, { [editCell.col]: finalVal })
            if (res.data?.status === 'pending_approval') {
                showToast('Update request sent to Admin for approval.')
            } else {
                setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: finalVal } : row))
                showToast('Saved!')
            }
        } catch (e) { showToast(e.response?.data?.detail || 'Save failed', 'error') }
        setEditCell(null)
    }
    const del = async (id) => {
        if (!window.confirm('Delete this candidate?')) return
        try { 
            const res = await axios.delete(`${API_URL}/api/candidates/${id}`); 
            if (res.data?.status === 'pending_approval') {
                showToast('Delete request sent to Admin for approval.')
            } else {
                setCandidates(p => p.filter(c => c.id !== id)); 
                showToast('Deleted') 
            }
        } catch { showToast('Delete failed', 'error') }
    }

    const getTableWidth = () => {
        let total = 0
        activeCols.forEach(c => {
            const w = c.pct
            if (w && typeof w === 'string' && w.endsWith('px')) {
                total += parseInt(w, 10)
            } else {
                total += 120
            }
        })
        return total
    }

    return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Drop Zone */}
            <div className="card">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontWeight: 600, color: 'var(--sky)' }}>
                    <Upload size={18} /> Upload Resumes
                </div>
                <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ textAlign: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: '8px', background: isDragActive ? 'rgba(var(--sky-rgb), 0.1)' : 'var(--input-bg)', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <input {...getInputProps()} />
                    <div style={{ marginBottom: '1rem' }}>
                        <UploadCloud size={40} className="icon" style={{ color: 'var(--sky)', filter: 'drop-shadow(0 0 10px rgba(var(--sky-rgb), 0.5))' }} />
                    </div>
                    <div className="dropzone-text" style={{ color: 'var(--text-dim)' }}>
                        {isDragActive ? <strong>Drop here…</strong> : <><strong>Drag & drop</strong> PDF / DOCX resumes, or click to browse</>}
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
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="section-header" style={{ borderBottom: '1px solid rgba(var(--sky-rgb), 0.2)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="section-title">👥 Candidate Details</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start', marginTop: '10px' }}>
                        <button className="btn btn-secondary" onClick={() => setShowFilter(true)} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                            <Filter size={14} /> Filter
                        </button>
                        
                        {/* Columns Selector Popover */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setShowColVisibility(!showColVisibility)} 
                                style={{ gap: 6, color: 'var(--text)', borderColor: 'var(--border)' }}
                            >
                                <Eye size={14} /> Columns
                            </button>
                            
                            {showColVisibility && (
                                <div 
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        position: 'absolute', top: '100%', left: 0, marginTop: '8px', zIndex: 100,
                                        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.35)', padding: '12px', width: '250px',
                                        display: 'flex', flexDirection: 'column', gap: '10px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--gold)' }}>Visible Columns</span>
                                        <button 
                                            onClick={() => setShowColVisibility(false)} 
                                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                                            title="Close Column Settings"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                        <button 
                                            onClick={handleShowAllColumns}
                                            style={{ 
                                                flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer' 
                                            }}
                                        >
                                            Show All
                                        </button>
                                        <button 
                                            onClick={handleHideAllColumns}
                                            style={{ 
                                                flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer' 
                                            }}
                                        >
                                            Hide All
                                        </button>
                                    </div>
                                    
                                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {cols.filter(c => c.key !== '_actions').map(c => {
                                            const isChecked = !hiddenColumnKeys.includes(c.key);
                                            return (
                                                <label 
                                                    key={c.key} 
                                                    style={{ 
                                                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', 
                                                        color: isChecked ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer',
                                                        padding: '4px 6px', borderRadius: '4px', transition: 'all 0.15s',
                                                        background: isChecked ? 'transparent' : 'rgba(var(--sky-rgb), 0.02)'
                                                    }}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isChecked}
                                                        onChange={() => toggleColumnVisibility(c.key)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="btn btn-secondary" onClick={() => setShowAddCol(true)} style={{ gap: 6, color: 'var(--gold)', borderColor: 'rgba(var(--gold-rgb), 0.3)' }}>
                            <span style={{ fontWeight: 900 }}>+</span> Add Column
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ gap: 6 }}
                            onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, activeCols.filter(c => c.key !== '_actions')), 'all_candidates_details.xlsx')}
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
                            <table style={{ width: getTableWidth(), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                <colgroup>
                                    {activeCols.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                                </colgroup>
                                <thead>
                                    <tr>
                                        {activeCols.map(c => {
                                            const isActions = c.key === '_actions';
                                            const isDragged = draggedColKey === c.key;
                                            const isDragTarget = dragOverColKey === c.key;
                                            
                                            // Harmonic highlight background and dashed border for drag targets
                                            let backgroundStyle = isActions ? 'var(--table-header-bg)' : TH.background;
                                            if (isDragTarget && !isDragged) {
                                                backgroundStyle = 'rgba(var(--gold-rgb), 0.18)';
                                            }
                                            
                                            return (
                                                <th 
                                                    key={c.key} 
                                                    draggable={!isActions}
                                                    onDragStart={(e) => !isActions && handleDragStart(e, c.key)}
                                                    onDragOver={(e) => !isActions && handleDragOver(e, c.key)}
                                                    onDragEnter={(e) => !isActions && handleDragEnter(e, c.key)}
                                                    onDragLeave={() => !isActions && setDragOverColKey(null)}
                                                    onDragEnd={() => !isActions && handleDragEnd()}
                                                    onDrop={(e) => !isActions && handleDrop(e, c.key)}
                                                    style={{ 
                                                        ...TH, 
                                                        position: isActions ? 'sticky' : undefined, 
                                                        right: isActions ? 0 : undefined, 
                                                        zIndex: isActions ? 11 : undefined,
                                                        background: backgroundStyle,
                                                        boxShadow: isActions ? '-3px 0 6px rgba(0,0,0,0.15)' : undefined,
                                                        cursor: isActions ? 'default' : (isDragged ? 'grabbing' : 'grab'),
                                                        opacity: isDragged ? 0.4 : 1,
                                                        borderLeft: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                        borderRight: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                        transition: 'all 0.2s ease-in-out'
                                                    }} 
                                                    title={isActions ? c.label : `${c.label} (Drag to reorder)`}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                                                        {!isActions && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                                                {c.isCustom ? (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            handleDeleteCol(c.key, c.label);
                                                                        }}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: '#ef4444',
                                                                            cursor: 'pointer',
                                                                            padding: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            transition: 'transform 0.15s, color 0.15s',
                                                                            opacity: 0.7,
                                                                        }}
                                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.7; }}
                                                                        title="Delete Column"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (window.confirm(`Are you sure you want to delete the "${c.label}" column?`)) {
                                                                                toggleColumnVisibility(c.key);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: 'var(--text-dim)',
                                                                            cursor: 'pointer',
                                                                            padding: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            transition: 'transform 0.15s, color 0.15s',
                                                                            opacity: 0.5,
                                                                        }}
                                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--gold)'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-dim)'; }}
                                                                        title="Hide Column"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                    <tr style={{ background: 'rgba(var(--navy-dark-rgb), 0.5)' }}>
                                        {activeCols.map(c => {
                                            const isActions = c.key === '_actions';
                                            if (isActions) {
                                                const hasAnyFilter = Object.values(columnFilters).some(v => v);
                                                return (
                                                    <th
                                                        key="filter-_actions"
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderBottom: '2px solid var(--border)',
                                                            position: 'sticky',
                                                            right: 0,
                                                            zIndex: 11,
                                                            background: 'rgba(var(--navy-dark-rgb), 0.95)',
                                                            boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        {hasAnyFilter && (
                                                            <button
                                                                onClick={() => setColumnFilters({})}
                                                                style={{
                                                                    background: 'rgba(239, 35, 60, 0.15)',
                                                                    border: '1px solid #ef233c',
                                                                    borderRadius: '4px',
                                                                    color: '#ef233c',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 'bold',
                                                                    padding: '4px 8px',
                                                                    width: '100%',
                                                                    transition: 'all 0.2s',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title="Clear all column filters"
                                                            >
                                                                <X size={10} /> Clear
                                                            </button>
                                                        )}
                                                    </th>
                                                );
                                            }

                                            return (
                                                <th
                                                    key={`filter-${c.key}`}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderBottom: '2px solid var(--border)',
                                                        background: 'rgba(var(--navy-rgb), 0.97)',
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={columnFilters[c.key] || ''}
                                                        onChange={e => setColumnFilters(prev => ({
                                                            ...prev,
                                                            [c.key]: e.target.value
                                                        }))}
                                                        placeholder="Search..."
                                                        style={{
                                                            width: '100%',
                                                            padding: '5px 8px',
                                                            borderRadius: '5px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--input-bg)',
                                                            color: 'var(--text)',
                                                            fontSize: '0.75rem',
                                                            outline: 'none',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onFocus={e => {
                                                            e.target.style.border = '1px solid var(--gold)';
                                                            e.target.style.boxShadow = '0 0 4px rgba(var(--gold-rgb), 0.3)';
                                                        }}
                                                        onBlur={e => {
                                                            e.target.style.border = '1px solid rgba(var(--sky-rgb), 0.25)';
                                                            e.target.style.boxShadow = 'none';
                                                        }}
                                                    />
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCandidates.length === 0 ? (
                                        <tr>
                                            <td colSpan={activeCols.length} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                                                <p style={{ margin: 0 }}>No candidates match the applied filters.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredCandidates.map((row, ri) => (
                                        <tr key={row.id || ri}
                                            style={{ background: ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent', transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.07)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent'}
                                        >
                                            {activeCols.map(({ key }) => {
                                                /* ── Actions column ── */
                                                if (key === '_actions') return (
                                                    <td 
                                                        key={key} 
                                                        style={{ 
                                                            ...TD_BASE, 
                                                            textAlign: 'center',
                                                            position: 'sticky',
                                                            right: 0,
                                                            zIndex: 10,
                                                            background: ri % 2 === 0 ? 'var(--input-bg)' : 'var(--card-bg)',
                                                            boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                            overflow: 'visible'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                            <button 
                                                                className="btn btn-danger" 
                                                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }} 
                                                                onClick={() => del(row.id)} 
                                                                title="Delete Candidate"
                                                            >
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                )

                                                const isEditing = editCell?.row === ri && editCell?.col === key
                                                const val = row[key] ?? ''
                                                const isExp = key === 'total_experience' || key === 'pega_experience' || key === 'cdh_exp'
                                                const isExpandable = key === 'skills' || key === 'certifications'

                                                /* ── Inline edit mode ── */
                                                if (isEditing) {
                                                     if (key === 'candidate_status') {
                                                         const statusOptions = ['New', 'In-Review', 'Available', 'Selected', 'Rejected', 'Engaged', 'Offered', 'Hired'];
                                                         return (
                                                             <td key={key} style={TD_BASE}>
                                                                 <select
                                                                     autoFocus
                                                                     value={editVal || 'New'}
                                                                     onChange={async (e) => {
                                                                         const newVal = e.target.value;
                                                                         setEditVal(newVal);
                                                                         try {
                                                                             await axios.put(`${API_URL}/api/candidates/${row.id}`, { candidate_status: newVal });
                                                                             setCandidates(prev => prev.map((r, i) => i === ri ? { ...r, candidate_status: newVal } : r));
                                                                             showToast('Saved!');
                                                                         } catch (err) {
                                                                             showToast(err.response?.data?.detail || 'Save failed', 'error');
                                                                         }
                                                                         setEditCell(null);
                                                                     }}
                                                                     onBlur={() => setEditCell(null)}
                                                                     onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
                                                                     style={{
                                                                         background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                                                         borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                                                         fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                                                     }}
                                                                 >
                                                                     {statusOptions.map(opt => (
                                                                         <option key={opt} value={opt} style={{ background: 'var(--card-bg)', color: 'var(--text)' }}>
                                                                             {opt}
                                                                         </option>
                                                                     ))}
                                                                 </select>
                                                             </td>
                                                         );
                                                     }
                                                     
                                                     return (
                                                         <td key={key} style={TD_BASE}>
                                                             <input autoFocus value={editVal}
                                                                 onChange={e => setEditVal(e.target.value)}
                                                                 onBlur={() => saveEdit(ri)}
                                                                 onKeyDown={e => { if (e.key === 'Enter') saveEdit(ri); if (e.key === 'Escape') setEditCell(null) }}
                                                                 style={{
                                                                     background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                                                     borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                                                     fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                                                 }}
                                                             />
                                                         </td>
                                                     );
                                                 }

                                                /* ── Expandable (skills / certs) — td stays overflow:hidden ── */
                                                if (isExpandable) return (
                                                    <td key={key} style={{ ...TD_BASE }} onDoubleClick={() => startEdit(ri, key, val)}>
                                                        <ExpandableCell value={val} onEdit={() => startEdit(ri, key, val)} />
                                                    </td>
                                                )

                                                /* ── Regular cells ── */
                                                let display;
                                                if (key === 'candidate_status') {
                                                     const s = String(val || 'New').trim();
                                                     let color = '#38bdf8';
                                                     let bg = 'rgba(56, 189, 248, 0.12)';
                                                     let border = '1px solid rgba(56, 189, 248, 0.25)';
                                                     
                                                     const lowerS = s.toLowerCase();
                                                     if (lowerS === 'in-review') {
                                                         color = '#fbbf24'; bg = 'rgba(251, 191, 36, 0.12)'; border = '1px solid rgba(251, 191, 36, 0.25)';
                                                     } else if (lowerS === 'available') {
                                                         color = '#34d399'; bg = 'rgba(52, 211, 153, 0.12)'; border = '1px solid rgba(52, 211, 153, 0.25)';
                                                     } else if (lowerS === 'selected') {
                                                         color = '#2dd4bf'; bg = 'rgba(45, 212, 191, 0.12)'; border = '1px solid rgba(45, 212, 191, 0.25)';
                                                     } else if (lowerS === 'rejected') {
                                                         color = '#f87171'; bg = 'rgba(248, 113, 113, 0.12)'; border = '1px solid rgba(248, 113, 113, 0.25)';
                                                     } else if (lowerS === 'engaged') {
                                                         color = '#c084fc'; bg = 'rgba(192, 132, 252, 0.12)'; border = '1px solid rgba(192, 132, 252, 0.25)';
                                                     } else if (lowerS === 'offered') {
                                                         color = '#f43f5e'; bg = 'rgba(244, 63, 94, 0.12)'; border = '1px solid rgba(244, 63, 94, 0.25)';
                                                     } else if (lowerS === 'hired') {
                                                         color = '#4ade80'; bg = 'rgba(74, 222, 128, 0.15)'; border = '1px solid rgba(74, 222, 128, 0.35)';
                                                     }
                                                     
                                                     display = (
                                                         <span style={{
                                                             background: bg, color: color, border: border,
                                                             borderRadius: 5, padding: '2px 8px', fontSize: '0.73rem',
                                                             fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
                                                             textTransform: 'capitalize'
                                                         }}>
                                                             {s}
                                                         </span>
                                                     );
                                                 } else if (isExp) {
                                                    display = (val !== '' && val != null ? `${val} yrs` : '—');
                                                } else if (key === 'notice_period' || key === 'availability_in_days') {
                                                    display = (val === 0 || val === '0') ? 'Immediate' : (val !== null && val !== '' && !isNaN(val) ? `${val} days` : (val || '—'));
                                                } else {
                                                    display = (val !== '' && val != null ? val : '—');
                                                }
                                                return (
                                                    <td key={key} onClick={() => {
                                                             if (key === 'candidate_status') startEdit(ri, key, val);
                                                         }}
                                                         onDoubleClick={() => {
                                                             if (key !== 'candidate_status') startEdit(ri, key, val);
                                                         }} style={{
                                                        ...TD_BASE,
                                                        color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                                        fontWeight: key === 'full_name' ? 700 : undefined,
                                                        /* overflow already hidden via TD_BASE — text clips cleanly */
                                                        whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                                            ? 'normal' : 'nowrap',
                                                        wordBreak: key === 'email' ? 'break-all' : undefined,
                                                        cursor: key === 'candidate_status' ? 'pointer' : 'text',
                                                    }}>
                                                        {key === 'full_name' && row.filename ? (
                                                            <span
                                                                onClick={() => setViewingPdf({ url: `${API_URL}/static/${row.filename}`, name: row.full_name })}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    color: 'var(--gold)',
                                                                    textDecoration: 'underline',
                                                                    cursor: 'pointer',
                                                                    fontWeight: 700,
                                                                    transition: 'color 0.2s'
                                                                }}
                                                                title={`View ${row.filename}`}
                                                            >
                                                                <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                                                {display}
                                                            </span>
                                                        ) : display}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.38)' }}>
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
                            <button onClick={() => setShowAddCol(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Column Name / Label</label>
                                <input
                                    autoFocus
                                    value={newColForm.label} onChange={e => setNewColForm(p => ({ ...p, label: e.target.value }))}
                                    placeholder="e.g. Current Location"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Description / AI Instructions</label>
                                <textarea
                                    value={newColForm.desc} onChange={e => setNewColForm(p => ({ ...p, desc: e.target.value }))}
                                    placeholder="e.g. City and State where candidate is located"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', minHeight: 80, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                            <button className="btn" onClick={handleAddCol} style={{ background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold' }}>
                                Create Column
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Modal */}
            {showFilter && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Filter Candidates</h3>
                            <button onClick={() => setShowFilter(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Total Experience (Years)</label>
                                <input
                                    type="number"
                                    value={filters.minTotalExp} onChange={e => setFilters(p => ({ ...p, minTotalExp: e.target.value }))}
                                    placeholder="e.g. 5"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Pega Experience (Years)</label>
                                <input
                                    type="number"
                                    value={filters.minPegaExp} onChange={e => setFilters(p => ({ ...p, minPegaExp: e.target.value }))}
                                    placeholder="e.g. 3"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Pega Certifications</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {PEGA_CERTS.map(cert => (
                                        <button 
                                            key={cert} 
                                            onClick={() => toggleCert(cert)}
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: 6, 
                                                background: filters.certs.includes(cert) ? 'rgba(var(--gold-rgb), 0.15)' : 'var(--input-bg)', 
                                                border: `1px solid ${filters.certs.includes(cert) ? 'var(--gold)' : 'var(--border)'}`, 
                                                color: filters.certs.includes(cert) ? 'var(--gold)' : 'var(--text)', 
                                                padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                                                transition: 'all 0.2s'
                                            }}>
                                            {filters.certs.includes(cert) && <Check size={12} />}
                                            {cert}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 5 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Additional Filters</label>
                                    <button 
                                        onClick={() => setCustomFilters(p => [...p, {col: cols.find(c => c.key !== '_del')?.key || '', val: ''}])} 
                                        style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fb)' }}>
                                        + Add Filter
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '150px', overflowY: 'auto' }}>
                                    {customFilters.map((cf, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <select 
                                                value={cf.col} 
                                                onChange={e => { const newF = [...customFilters]; newF[i].col = e.target.value; setCustomFilters(newF); }} 
                                                style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }}>
                                                {cols.filter(c => c.key !== '_del').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                            </select>
                                            <input 
                                                value={cf.val} 
                                                onChange={e => { const newF = [...customFilters]; newF[i].val = e.target.value; setCustomFilters(newF); }} 
                                                placeholder="e.g. Hyderabad" 
                                                style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }} 
                                            />
                                            <button 
                                                onClick={() => setCustomFilters(p => p.filter((_, idx) => idx !== i))} 
                                                style={{ background: 'none', border: 'none', color: '#ef233c', cursor: 'pointer', padding: '0 4px', display: 'flex' }}>
                                                <X size={14}/>
                                            </button>
                                        </div>
                                    ))}
                                    {customFilters.length === 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.4)', fontStyle: 'italic' }}>
                                            No additional filters applied.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button className="btn btn-secondary" onClick={() => { setFilters({ minTotalExp: '', minPegaExp: '', certs: [] }); setCustomFilters([]); setColumnFilters({}); }} style={{ flex: 1, borderColor: 'var(--border)' }}>
                                    Clear All
                                </button>
                                <button className="btn" onClick={() => setShowFilter(false)} style={{ flex: 1, background: '#ffb703', color: '#011627', fontWeight: '900', border: 'none' }}>
                                    Apply Filter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Column Reordering Modal Removed */}

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
                            padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.98)', borderBottom: '1px solid var(--border)' 
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.05rem' }}>
                                <span style={{fontSize: '1.2rem', opacity: 0.8}}>📄</span> {viewingPdf.name}
                            </h3>
                            <button onClick={() => setViewingPdf(null)} style={{ 
                                background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)', 
                                color: 'var(--gold)', cursor: 'pointer', padding: 6, borderRadius: '8px', 
                                display: 'flex', transition: 'all 0.2s' 
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
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

