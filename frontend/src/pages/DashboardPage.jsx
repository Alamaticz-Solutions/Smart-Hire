import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Cell
} from 'recharts'
import { Users, Clock, Download, Plus, Trash2, FileText, X, Loader, BarChart3, Timer, BarChart2 } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'
import apiClient, { getStaticUrl } from '../api/client'
import CandidateDetailsModal from '../components/shared/CandidateDetailsModal'
import CellTextModal from '../components/shared/CellTextModal'
import SkillBadges from '../components/shared/SkillBadges'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export default function DashboardPage() {
    // `Layout.jsx` provides `user` via `<Outlet context={{ user, onUpdateUser }} />`;
    // every sibling page (JobsPage, UploadPage, ChatPage) already reads it this
    // way. This file was missing the destructure entirely, so its one
    // `user?.username` reference (in handleDeleteCandidate below) threw
    // `ReferenceError: user is not defined` whenever a candidate was deleted
    // from the Dashboard. Fixed by adopting the same established pattern.
    const { user } = useOutletContext()
    const { toast, showToast, dismissToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [candidates, setCandidates] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('cached_candidates')) || [];
        } catch { return []; }
    })
    const [columns, setColumns] = useState([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState('all') // 'all' | 'immediate'
    const summaryRef = useRef(null)

    const [showAddCol, setShowAddCol] = useState(false)
    const [newColLabel, setNewColLabel] = useState('')
    const [newColDesc, setNewColDesc] = useState('')
    const [addingCol, setAddingCol] = useState(false)
    const [editStatusCell, setEditStatusCell] = useState(null)
    const [selectedCandidateForDetails, setSelectedCandidateForDetails] = useState(null)
    const [selectedCellText, setSelectedCellText] = useState(null)

    useEffect(() => {
        Promise.all([
            apiClient.get('/api/candidates'),
            apiClient.get('/api/columns')
        ]).then(([candRes, colRes]) => {
            setCandidates(candRes.data)
            sessionStorage.setItem('cached_candidates', JSON.stringify(candRes.data))
            setColumns([...colRes.data.base, ...colRes.data.custom])
        }).catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    const handleAddColumn = async () => {
        if (!newColLabel || !newColDesc) return;
        setAddingCol(true);
        try {
            await apiClient.post('/api/columns', {
                col_key: newColLabel,
                col_label: newColLabel,
                description: newColDesc
            });
            const cols = await apiClient.get('/api/columns');
            setColumns([...cols.data.base, ...cols.data.custom]);
            setShowAddCol(false);
            setNewColLabel('');
            setNewColDesc('');
        } catch (e) {
            showToast('Failed to add column: ' + (e.response?.data?.detail || e.message), 'error');
        } finally {
            setAddingCol(false);
        }
    }

    const handleDeleteCandidate = async (id, name) => {
        if (!await confirm({ title: 'Delete candidate?', message: `Are you sure you want to delete ${name || 'this candidate'}?`, confirmLabel: 'Delete' })) return;
        try {
            await apiClient.delete(`/api/candidates/${id}`, {
                headers: { 'x-user-username': user?.username }
            });
            setCandidates(prev => prev.filter(c => c.id !== id));
        } catch (e) {
            showToast('Failed to delete candidate: ' + (e.response?.data?.detail || e.message), 'error');
        }
    }

    const totalCandidates = candidates.length
    const isImmediate = (val) => {
        if (val === 0 || val === '0') return true;
        return String(val || '').toLowerCase().includes('immediate');
    };

    const immediate = candidates.filter(c => isImmediate(c.notice_period)).length

    const filteredCandidates = filterType === 'immediate'
        ? candidates.filter(c => isImmediate(c.notice_period))
        : candidates

    // Virtualization, same pattern as pages/jobs/CandidatesTable.jsx and
    // pages/upload/CandidatesTable.jsx: only mount rows in/near the visible
    // scroll area instead of every row in filteredCandidates. Unlike those
    // two tables, this one didn't need a new scroll region added for this -
    // the maxHeight: '70vh' wrapper below already existed.
    const tableScrollRef = useRef(null)
    const rowVirtualizer = useVirtualizer({
        count: filteredCandidates.length,
        getScrollElement: () => tableScrollRef.current,
        estimateSize: () => 44,
        overscan: 8,
        measureElement: (el) => el.getBoundingClientRect().height,
    })

    const handleKpiClick = (type) => {
        setFilterType(type)
        summaryRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const expChartData = candidates.map(c => ({
        name: c.full_name || c.filename || '?',
        'Total Exp': +c.total_experience || 0,
        'Pega Exp': +c.pega_experience || 0,
    }))

    const noticeCounts = {}
    candidates.forEach(c => {
        let k = String(c.notice_period ?? '').trim()
        if (k === '0') k = 'Immediate'
        else if (k !== '' && !isNaN(k)) k = `${k} days`
        if (k) noticeCounts[k] = (noticeCounts[k] || 0) + 1
    })
    const noticeData = Object.entries(noticeCounts).map(([name, value]) => ({ name, value }))

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
            <div style={{
                background: 'rgba(var(--navy-dark-rgb), 0.95)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                borderRadius: 10, padding: '10px 14px', fontSize: '0.84rem'
            }}>
                <p style={{ color: 'var(--gold)', marginBottom: 6, fontWeight: 700 }}>{label}</p>
                {payload.map(p => (
                    <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value} yrs</strong></p>
                ))}
            </div>
        )
    }

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
    )

    return (
        <div style={{ padding: '2rem', flex: 1 }}>

            {/* KPIs */}
            <div className="kpi-grid">
                {[
                    { label: 'Total Candidates', value: totalCandidates, Icon: Users, type: 'all' },
                    { label: 'Immediate Joiners', value: immediate, Icon: Clock, type: 'immediate' },
                ].map(({ label, value, Icon, type }) => (
                    <div
                        className={`kpi-card ${filterType === type ? 'active' : ''}`}
                        key={label}
                        onClick={() => handleKpiClick(type)}
                        style={{ cursor: 'pointer', border: filterType === type ? '1px solid var(--gold)' : '' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                            <div style={{
                                width: 42, height: 42, background: 'rgba(var(--gold-rgb), 0.12)',
                                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Icon size={20} color="var(--gold)" />
                            </div>
                        </div>
                        <div className="kpi-value">{value}</div>
                        <div className="kpi-label">{label}</div>
                    </div>
                ))}
            </div>

            {/* Empty state */}
            {candidates.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                    <BarChart2 size={40} style={{ marginBottom: '1rem', color: 'var(--text-dim)' }} />
                    <p style={{ fontSize: '1.1rem', fontFamily: 'var(--fh)', color: 'var(--gold)' }}>No Data Yet</p>
                    <p style={{ marginTop: '0.5rem' }}>Upload and analyze resumes to see insights here.</p>
                </div>
            ) : (
                <>
                    {/* Charts */}
                    <div className="charts-grid">
                        <div className="card">
                            <div className="card-title"><BarChart3 size={17} /> Experience</div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={expChartData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} angle={-30} textAnchor="end" />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} unit=" yr" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 13 }} />
                                    <Bar dataKey="Total Exp" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Pega Exp" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="card">
                            <div className="card-title"><Timer size={17} /> Notice Period</div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={noticeData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} angle={-30} textAnchor="end" />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} allowDecimals={false} />
                                    <Tooltip contentStyle={{
                                        background: 'var(--input-bg)',
                                        border: '1px solid rgba(var(--gold-rgb), 0.3)', borderRadius: 10, color: 'var(--text)'
                                    }} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {noticeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Summary Table — responsive layout */}
                    <div className="card" ref={summaryRef}>
                        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minWidth: '800px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users size={17} /> {filterType === 'immediate' ? 'Immediate Joiners' : 'Candidate Summary'}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.75rem', padding: '6px 12px', gap: 6 }}
                                    onClick={() => setShowAddCol(true)}
                                >
                                    <Plus size={14} /> Add Custom Column
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '6px 12px', gap: 6 }}
                                    onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, columns), 'hire_ai_candidates.xlsx')}
                                >
                                    <Download size={14} /> Download Excel
                                </button>
                            </div>
                        </div>
                        <div ref={tableScrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
                            <table style={{ minWidth: '2600px', width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(var(--navy-rgb), 0.9)' }}>
                                        {columns.map(h => (
                                            <th key={h.col_key} style={{
                                                padding: '11px 12px', textAlign: 'left',
                                                fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.78rem',
                                                color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem',
                                                borderBottom: '1px solid var(--border)',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 12,
                                                background: 'rgba(var(--navy-rgb), 0.95)'
                                            }}>
                                                {h.col_label}
                                            </th>
                                        ))}
                                        <th style={{
                                            padding: '11px 12px', textAlign: 'center',
                                            fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.78rem',
                                            color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem',
                                            borderBottom: '1px solid var(--border)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 12,
                                            background: 'rgba(var(--navy-rgb), 0.95)'
                                        }}>
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                            <tbody>
                                {rowVirtualizer.getVirtualItems().length > 0 && (
                                    <tr aria-hidden="true">
                                        <td colSpan={columns.length + 1} style={{ padding: 0, border: 'none', height: rowVirtualizer.getVirtualItems()[0].start }} />
                                    </tr>
                                )}
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const i = virtualRow.index
                                    const c = filteredCandidates[i]
                                    return (
                                    <tr key={c.id || i} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{
                                        borderBottom: '1px solid rgba(var(--sky-rgb), 0.1)',
                                        background: i % 2 === 0 ? 'rgba(var(--navy-rgb), 0.2)' : 'transparent'
                                    }}>
                                        {columns.map(col => {
                                            if (col.col_key === 'full_name') {
                                                return <td style={{ padding: '10px 12px', verticalAlign: 'top', minWidth: '180px' }} key={col.col_key}>
                                                    <span
                                                        onClick={() => setSelectedCandidateForDetails(c)}
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
                                                        title="View Candidate Profile & Jobs"
                                                    >
                                                        <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                                        {c.full_name || '—'}
                                                    </span>
                                                </td>
                                            }
                                            if (col.col_key === 'skills') {
                                                return <td 
                                                    key={col.col_key} 
                                                    onDoubleClick={() => {
                                                        if (c.skills) setSelectedCellText({ title: col.col_label, text: String(c.skills) });
                                                    }}
                                                    title={c.skills ? "Double-click to view full text" : ""}
                                                    style={{ padding: '10px 12px', verticalAlign: 'top', cursor: c.skills ? 'pointer' : 'default' }}
                                                >
                                                    <SkillBadges skills={c.skills} />
                                                </td>
                                            }
                                            if (col.col_key === 'notice_period' || col.col_key === 'availability_in_days') {
                                                const val = c[col.col_key];
                                                const displayVal = val === 0 || val === '0' ? 'Immediate' : (val !== null && val !== '' && !isNaN(val) ? `${val} days` : (val || '—'));
                                                return <td 
                                                    key={col.col_key} 
                                                    onDoubleClick={() => {
                                                        if (val != null && String(val).trim() !== '') setSelectedCellText({ title: col.col_label, text: String(displayVal) });
                                                    }}
                                                    title={val != null && String(val).trim() !== '' ? "Double-click to view full text" : ""}
                                                    style={{ padding: '10px 12px', verticalAlign: 'top', cursor: val != null && String(val).trim() !== '' ? 'pointer' : 'default' }}
                                                >
                                                    <span className={`badge ${isImmediate(val) ? 'badge-green' : 'badge-sky'}`}>
                                                        {displayVal}
                                                    </span>
                                                </td>
                                            }
                                            if (col.col_key === 'candidate_status') {
                                                const s = String(c.candidate_status || 'New').trim();
                                                const isEditing = editStatusCell?.candidateId === c.id;
 
                                                if (isEditing) {
                                                    const statusOptions = ['New', 'In-Review', 'Available', 'Selected', 'Rejected', 'Engaged', 'Offered', 'Hired'];
                                                    return (
                                                        <td key={col.col_key} style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                                                            <select
                                                                autoFocus
                                                                value={s}
                                                                onChange={async (e) => {
                                                                    const newVal = e.target.value;
                                                                    try {
                                                                        await apiClient.put(`/api/candidates/${c.id}`, { candidate_status: newVal });
                                                                        setCandidates(prev => prev.map((cand) => cand.id === c.id ? { ...cand, candidate_status: newVal } : cand));
                                                                    } catch (err) {
                                                                        showToast('Save failed: ' + (err.response?.data?.detail || err.message), 'error');
                                                                    }
                                                                    setEditStatusCell(null);
                                                                }}
                                                                onBlur={() => setEditStatusCell(null)}
                                                                onKeyDown={e => { if (e.key === 'Escape') setEditStatusCell(null); }}
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

                                                const statusClass = 'status-' + s.toLowerCase().replace(/\s+/g, '-');

                                                return (
                                                    <td
                                                        key={col.col_key}
                                                        onClick={() => setEditStatusCell({ candidateId: c.id })}
                                                        style={{ padding: '10px 12px', verticalAlign: 'top', cursor: 'pointer' }}
                                                    >
                                                        <span className={`status-chip ${statusClass}`}>
                                                            {s}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            if (col.col_key === 'total_experience' || col.col_key === 'pega_experience' || col.col_key === 'cdh_exp') {
                                                const val = c[col.col_key];
                                                const displayVal = val ? `${val} yrs` : '—';
                                                return <td 
                                                    key={col.col_key} 
                                                    onDoubleClick={() => {
                                                        if (val != null && String(val).trim() !== '') setSelectedCellText({ title: col.col_label, text: String(displayVal) });
                                                    }}
                                                    title={val != null && String(val).trim() !== '' ? "Double-click to view full text" : ""}
                                                    style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top', cursor: val != null && String(val).trim() !== '' ? 'pointer' : 'default' }}
                                                >
                                                    {displayVal}
                                                </td>
                                            }
                                            return <td 
                                                key={col.col_key} 
                                                onDoubleClick={() => {
                                                    const val = c[col.col_key];
                                                    if (val != null && String(val).trim() !== '') {
                                                        setSelectedCellText({ title: col.col_label, text: String(val) });
                                                    }
                                                }}
                                                title={c[col.col_key] ? "Double-click to view full text" : ""}
                                                style={{ 
                                                    padding: '10px 12px', 
                                                    verticalAlign: 'top', 
                                                    color: col.col_key === 'email' ? 'var(--sky-dim)' : 'inherit', 
                                                    wordBreak: col.col_key === 'email' ? 'break-all' : 'break-word',
                                                    cursor: c[col.col_key] ? 'pointer' : 'default'
                                                }}
                                            >
                                                {col.col_key === 'email' && c[col.col_key] ? (
                                                    <a 
                                                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=${c[col.col_key]}`} 
                                                        target="_blank" 
                                                        rel="noreferrer" 
                                                        title="Send email via Gmail" 
                                                        style={{ color: 'var(--sky-dim)', textDecoration: 'underline', cursor: 'pointer' }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        {c[col.col_key]}
                                                    </a>
                                                ) : (
                                                    c[col.col_key] || '—'
                                                )}
                                            </td>
                                        })}
                                        <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}
                                                onClick={() => handleDeleteCandidate(c.id, c.full_name)}
                                                title="Delete Candidate"
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </td>
                                    </tr>
                                )})}
                                {rowVirtualizer.getVirtualItems().length > 0 && (
                                    <tr aria-hidden="true">
                                        <td colSpan={columns.length + 1} style={{
                                            padding: 0, border: 'none',
                                            height: rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end,
                                        }} />
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>
            )}

            {/* Add Column Modal */}
            {showAddCol && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '400px', padding: '2rem' }}>
                        <h3 style={{ color: 'var(--gold)', marginBottom: '1.5rem', fontFamily: 'var(--fh)' }}>Add Custom Column</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sky-dim)', marginBottom: '6px' }}>Column Label</label>
                            <input
                                type="text"
                                value={newColLabel}
                                onChange={e => setNewColLabel(e.target.value)}
                                placeholder="e.g. Github Profile"
                                style={{ width: '100%', padding: '10px', background: 'rgba(var(--navy-dark-rgb), 0.8)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6 }}
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sky-dim)', marginBottom: '6px' }}>AI Extraction Prompt</label>
                            <textarea
                                value={newColDesc}
                                onChange={e => setNewColDesc(e.target.value)}
                                placeholder="e.g. Extract the candidate's Github URL. Leave empty if none."
                                rows={3}
                                style={{ width: '100%', padding: '10px', background: 'rgba(var(--navy-dark-rgb), 0.8)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddCol(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleAddColumn} disabled={addingCol || !newColLabel || !newColDesc}>
                                {addingCol ? 'Adding...' : 'Add Column'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Candidate Details Modal */}
            {selectedCandidateForDetails && (
                <CandidateDetailsModal 
                    candidate={selectedCandidateForDetails} 
                    onClose={() => setSelectedCandidateForDetails(null)} 
                    onViewPdf={(filename, name) => {
                        window.open(getStaticUrl(filename), '_blank');
                    }}
                />
            )}

            {/* Cell Text Modal */}
            {selectedCellText && (
                <CellTextModal
                    data={selectedCellText}
                    onClose={() => setSelectedCellText(null)}
                />
            )}
            <ToastHost toast={toast} onDismiss={dismissToast} />
            <ConfirmDialog {...confirmDialogProps} />
        </div>
    )
}

