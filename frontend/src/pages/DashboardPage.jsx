import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Cell
} from 'recharts'
import { Users, Clock, Download, Plus } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'

function SkillBadges({ skills }) {
    if (!skills) return <span style={{ opacity: 0.35 }}>—</span>
    const list = String(skills).split(',').map(s => s.trim()).filter(Boolean)
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {list.map((s, i) => (
                <span key={i} style={{
                    background: 'rgba(33,158,188,0.12)', border: '1px solid rgba(33,158,188,0.25)',
                    borderRadius: 5, padding: '1px 7px', fontSize: '0.73rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', lineHeight: '1.6',
                }}>{s}</span>
            ))}
        </div>
    )
}

const COLORS = ['#FB8500', '#FFB703', '#219EBC', '#8ECAE6', '#023047']

export default function DashboardPage() {
    const [candidates, setCandidates] = useState([])
    const [columns, setColumns] = useState([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState('all') // 'all' | 'immediate'
    const summaryRef = useRef(null)

    const [showAddCol, setShowAddCol] = useState(false)
    const [newColLabel, setNewColLabel] = useState('')
    const [newColDesc, setNewColDesc] = useState('')
    const [addingCol, setAddingCol] = useState(false)

    useEffect(() => {
        Promise.all([
            axios.get('https://resume-2-34ki.onrender.com/api/candidates'),
            axios.get('https://resume-2-34ki.onrender.com/api/columns')
        ]).then(([candRes, colRes]) => {
            setCandidates(candRes.data)
            setColumns([...colRes.data.base, ...colRes.data.custom])
        }).catch(() => { })
        .finally(() => setLoading(false))
    }, [])

    const handleAddColumn = async () => {
        if (!newColLabel || !newColDesc) return;
        setAddingCol(true);
        try {
            const res = await axios.post('https://resume-2-34ki.onrender.com/api/columns', {
                col_key: newColLabel,
                col_label: newColLabel,
                description: newColDesc
            });
            const cols = await axios.get('https://resume-2-34ki.onrender.com/api/columns');
            setColumns([...cols.data.base, ...cols.data.custom]);
            setShowAddCol(false);
            setNewColLabel('');
            setNewColDesc('');
        } catch (e) {
            alert('Failed to add column: ' + (e.response?.data?.detail || e.message));
        } finally {
            setAddingCol(false);
        }
    }

    const totalCandidates = candidates.length
    const immediate = candidates.filter(c =>
        (c.notice_period || '').toLowerCase().includes('immediate')
    ).length

    const filteredCandidates = filterType === 'immediate'
        ? candidates.filter(c => (c.notice_period || '').toLowerCase().includes('immediate'))
        : candidates

    const handleKpiClick = (type) => {
        setFilterType(type)
        summaryRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const expChartData = candidates.map(c => ({
        name: (c.full_name || c.filename || '?').split(' ')[0],
        'Total Exp': +c.total_experience || 0,
        'Pega Exp': +c.pega_experience || 0,
    }))

    const noticeCounts = {}
    candidates.forEach(c => {
        const k = (c.notice_period || '').trim()
        if (k) noticeCounts[k] = (noticeCounts[k] || 0) + 1
    })
    const noticeData = Object.entries(noticeCounts).map(([name, value]) => ({ name, value }))

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
            <div style={{
                background: 'rgba(1,22,39,0.95)', border: '1px solid rgba(255,183,3,0.3)',
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
                                width: 42, height: 42, background: 'rgba(255,183,3,0.12)',
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
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                    <p style={{ fontSize: '1.1rem', fontFamily: 'var(--fh)', color: 'var(--gold)' }}>No Data Yet</p>
                    <p style={{ marginTop: '0.5rem' }}>Upload and analyze resumes to see insights here.</p>
                </div>
            ) : (
                <>
                    {/* Charts */}
                    <div className="charts-grid">
                        <div className="card">
                            <div className="card-title">📊 Experience</div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={expChartData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: '#8ECAE6', fontSize: 12 }} angle={-30} textAnchor="end" />
                                    <YAxis tick={{ fill: '#8ECAE6', fontSize: 12 }} unit=" yr" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ color: '#8ECAE6', fontSize: 13 }} />
                                    <Bar dataKey="Total Exp" fill="#FB8500" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="Pega Exp" fill="#FFB703" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="card">
                            <div className="card-title">⏱ Notice Period</div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={noticeData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: '#8ECAE6', fontSize: 12 }} angle={-30} textAnchor="end" />
                                    <YAxis tick={{ fill: '#8ECAE6', fontSize: 12 }} allowDecimals={false} />
                                    <Tooltip contentStyle={{
                                        background: 'rgba(1,22,39,0.95)',
                                        border: '1px solid rgba(255,183,3,0.3)', borderRadius: 10, color: '#fff'
                                    }} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {noticeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Summary Table — responsive layout */}
                    <div className="card" ref={summaryRef} style={{ overflowX: 'auto' }}>
                        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minWidth: '800px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                👥 {filterType === 'immediate' ? 'Immediate Joiners' : 'Candidate Summary'}
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
                        <table style={{ minWidth: '1000px', width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(2,48,71,0.9)' }}>
                                    {columns.map(h => (
                                        <th key={h.col_key} style={{
                                            padding: '11px 12px', textAlign: 'left',
                                            fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.78rem',
                                            color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem',
                                            borderBottom: '1px solid var(--border)'
                                        }}>
                                            {h.col_label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCandidates.map((c, i) => (
                                    <tr key={i} style={{
                                        borderBottom: '1px solid rgba(33,158,188,0.1)',
                                        background: i % 2 === 0 ? 'rgba(2,48,71,0.2)' : 'transparent'
                                    }}>
                                        {columns.map(col => {
                                            if (col.col_key === 'full_name') {
                                                return <td style={{ padding: '10px 12px', color: 'var(--gold)', fontWeight: 600, wordBreak: 'break-word', verticalAlign: 'top' }} key={col.col_key}>
                                                    <a href={`/static/${c.filename}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed transparent', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = 'var(--gold)'} onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'} title={`Download ${c.filename}`}>
                                                        {c.full_name || '—'}
                                                    </a>
                                                </td>
                                            }
                                            if (col.col_key === 'skills') {
                                                return <td key={col.col_key} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                                    <SkillBadges skills={c.skills} />
                                                </td>
                                            }
                                            if (col.col_key === 'notice_period') {
                                                return <td key={col.col_key} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                                    <span className={`badge ${(c.notice_period || '').toLowerCase().includes('immediate') ? 'badge-green' : 'badge-sky'}`}>
                                                        {c.notice_period || '—'}
                                                    </span>
                                                </td>
                                            }
                                            if (col.col_key === 'total_experience' || col.col_key === 'pega_experience') {
                                                return <td key={col.col_key} style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                                    {c[col.col_key] ? `${c[col.col_key]} yrs` : '—'}
                                                </td>
                                            }
                                            return <td key={col.col_key} style={{ padding: '10px 12px', verticalAlign: 'top', color: col.col_key === 'email' ? 'var(--sky-dim)' : 'inherit', wordBreak: col.col_key === 'email' ? 'break-all' : 'break-word' }}>
                                                {c[col.col_key] || '—'}
                                            </td>
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                style={{ width: '100%', padding: '10px', background: 'rgba(1,22,39,0.8)', border: '1px solid var(--border)', color: '#fff', borderRadius: 6 }}
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sky-dim)', marginBottom: '6px' }}>AI Extraction Prompt</label>
                            <textarea 
                                value={newColDesc} 
                                onChange={e => setNewColDesc(e.target.value)} 
                                placeholder="e.g. Extract the candidate's Github URL. Leave empty if none." 
                                rows={3}
                                style={{ width: '100%', padding: '10px', background: 'rgba(1,22,39,0.8)', border: '1px solid var(--border)', color: '#fff', borderRadius: 6, resize: 'vertical' }}
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
        </div>
    )
}

