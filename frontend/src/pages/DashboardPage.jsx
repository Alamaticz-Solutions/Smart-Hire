import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Cell
} from 'recharts'
import { Users, Clock, Download, Plus, Trash2, FileText, X, Loader } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'

/* ─── Candidate Details Modal ────────────────────────────────────────────── */
function CandidateDetailsModal({ candidate, onClose, onViewPdf }) {
    const [activeTab, setActiveTab] = useState('profile');
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);

    useEffect(() => {
        if (candidate?.id) {
            setLoadingJobs(true);
            axios.get(`${import.meta.env.VITE_API_URL || ''}/api/candidates/${candidate.id}/jobs`)
                .then(res => setJobs(res.data || []))
                .catch(err => console.error("Failed to load candidate matched jobs", err))
                .finally(() => setLoadingJobs(false));
        }
    }, [candidate]);

    const isImmediate = (val) => {
        if (val === 0 || val === '0') return true;
        return String(val || '').toLowerCase().includes('immediate');
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', zIndex: 99998,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{
                width: '95%', maxWidth: '800px', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column', padding: 0,
                overflow: 'hidden', border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                background: 'var(--navy-dark)'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.95)',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.25rem', fontWeight: 800 }}>
                            {candidate.full_name || 'Candidate Details'}
                        </h3>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', gap: '15px' }}>
                            <span>Source: <strong style={{ color: 'var(--gold)' }}>{candidate.source || 'Resume Upload'}</strong></span>
                            {candidate.timestamp && <span>Analyzed: {new Date(candidate.timestamp).toLocaleDateString()}</span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {candidate.filename && !candidate.filename.toLowerCase().endsWith('.xlsx') && !candidate.filename.toLowerCase().endsWith('.xls') && !candidate.filename.toLowerCase().endsWith('.csv') && (
                            <button 
                                onClick={() => onViewPdf(candidate.filename, candidate.full_name)}
                                style={{
                                    background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                    color: 'var(--sky-dim)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                    fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.25)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.15)'}
                            >
                                <FileText size={14} /> View Resume
                            </button>
                        )}
                        <button onClick={onClose} style={{
                            background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                            color: 'var(--gold)', cursor: 'pointer', padding: '6px', borderRadius: '8px',
                            display: 'flex', transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Tabs Selector */}
                <div style={{ display: 'flex', background: 'rgba(var(--navy-rgb), 0.3)', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
                    <button 
                        onClick={() => setActiveTab('profile')}
                        style={{
                            padding: '12px 20px', background: 'transparent', border: 'none',
                            borderBottom: `3px solid ${activeTab === 'profile' ? 'var(--gold)' : 'transparent'}`,
                            color: activeTab === 'profile' ? 'var(--gold)' : 'var(--text-dim)',
                            fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            transition: 'all 0.2s', outline: 'none'
                        }}
                    >
                        👤 Profile Details
                    </button>
                    <button 
                        onClick={() => setActiveTab('jobs')}
                        style={{
                            padding: '12px 20px', background: 'transparent', border: 'none',
                            borderBottom: `3px solid ${activeTab === 'jobs' ? 'var(--gold)' : 'transparent'}`,
                            color: activeTab === 'jobs' ? 'var(--gold)' : 'var(--text-dim)',
                            fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            transition: 'all 0.2s', outline: 'none'
                        }}
                    >
                        💼 Matched & Selected Jobs ({jobs.length})
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', color: 'var(--text)' }}>
                    {activeTab === 'profile' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Grid fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Name</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.full_name || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Source</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.1)', padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                        {candidate.source || 'Resume Upload'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Total Experience</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.total_experience ? `${candidate.total_experience} yrs` : '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Pega Experience</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.pega_experience ? `${candidate.pega_experience} yrs` : '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>CDH Experience</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.cdh_exp ? `${candidate.cdh_exp} yrs` : '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current CTC / salary</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.ctc || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Expected CTC</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.expected_ctc || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Percentage Hike</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.percentage_hike || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Notice Period</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                                        <span className={`badge ${isImmediate(candidate.notice_period) ? 'badge-green' : 'badge-sky'}`}>
                                            {candidate.notice_period === 0 || candidate.notice_period === '0' ? 'Immediate' : (candidate.notice_period ? `${candidate.notice_period} days` : '—')}
                                        </span>
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current Location</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.current_location || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Preferred Location</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.pref_locations || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current Employment</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.current_organization || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Phone Number</span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.phone || '—'}</span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Email Address</span>
                                    {candidate.email ? (
                                        <a 
                                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${candidate.email}`} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--sky-dim)', textDecoration: 'underline', wordBreak: 'break-all' }}
                                            title="Click to compose in Gmail"
                                        >
                                            ✉️ {candidate.email}
                                        </a>
                                    ) : '—'}
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>LinkedIn Profile</span>
                                    {candidate.linkedin ? (
                                        <a href={candidate.linkedin.startsWith('http') ? candidate.linkedin : `https://${candidate.linkedin}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)', textDecoration: 'underline' }}>
                                            View LinkedIn
                                        </a>
                                    ) : '—'}
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />

                            {/* Long Text Areas */}
                            <div>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Skills</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {candidate.skills ? String(candidate.skills).split(',').map((s, idx) => (
                                        <span key={idx} style={{
                                            background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                                            borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--sky-dim)'
                                        }}>{s.trim()}</span>
                                    )) : <span style={{ opacity: 0.35 }}>—</span>}
                                </div>
                            </div>

                            <div>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Certifications</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {candidate.certifications ? String(candidate.certifications).split(',').map((c, idx) => (
                                        <span key={idx} style={{
                                            background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.25)',
                                            borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--gold)'
                                        }}>{c.trim()}</span>
                                    )) : <span style={{ opacity: 0.35 }}>—</span>}
                                </div>
                            </div>

                            {candidate.notescomments && (
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Notes / Recruiter Comments</span>
                                    <div style={{ padding: '12px', background: 'rgba(var(--navy-dark-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                        {candidate.notescomments}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            {loadingJobs ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                                </div>
                            ) : jobs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                    No associated job mappings found for this candidate.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(var(--navy-rgb), 0.85)', borderBottom: '2px solid var(--border)' }}>
                                                <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Job Title</th>
                                                <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Client</th>
                                                <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Status</th>
                                                <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800, width: '45%' }}>AI Match Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {jobs.map((job, idx) => {
                                                const s = String(job.match_status || 'matched').trim();
                                                const isSelected = s === 'selected';
                                                
                                                return (
                                                    <tr key={idx} style={{ 
                                                        borderBottom: '1px solid rgba(var(--sky-rgb), 0.08)',
                                                        background: idx % 2 === 0 ? 'rgba(var(--navy-rgb), 0.15)' : 'transparent'
                                                    }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{job.title}</td>
                                                        <td style={{ padding: '10px 12px' }}>{job.client_name || '—'}</td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <span style={{
                                                                background: isSelected ? 'rgba(45, 212, 191, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                                                                color: isSelected ? '#2dd4bf' : '#38bdf8',
                                                                border: isSelected ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid rgba(56, 189, 248, 0.25)',
                                                                borderRadius: 5, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
                                                                textTransform: 'uppercase', display: 'inline-block'
                                                            }}>
                                                                {s}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: '1.45' }}>
                                                            {job.ai_reason || '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Cell Text Modal ─────────────────────────────────────────────────────── */
function CellTextModal({ data, onClose }) {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
        navigator.clipboard.writeText(data.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{
                width: '90%', maxWidth: '600px', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', padding: 0,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                background: 'var(--navy-dark)'
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.95)',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800 }}>
                        🔍 View {data.title}
                    </h3>
                    <button onClick={onClose} style={{
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
                <div style={{
                    flex: 1, padding: '24px', overflowY: 'auto',
                    color: 'var(--text)', fontSize: '0.92rem', lineHeight: '1.5',
                    whiteSpace: 'pre-wrap', maxHeight: '50vh', background: 'rgba(0,0,0,0.2)'
                }}>
                    {data.text}
                </div>
                <div style={{
                    padding: '12px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(var(--navy-rgb), 0.3)'
                }}>
                    <button 
                        onClick={handleCopy}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px', borderColor: 'var(--border)' }}
                    >
                        {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
                    </button>
                    <button 
                        onClick={onClose}
                        className="btn btn-primary"
                        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function SkillBadges({ skills }) {
    if (!skills) return <span style={{ opacity: 0.35 }}>—</span>
    const list = String(skills).split(',').map(s => s.trim()).filter(Boolean)
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {list.map((s, i) => (
                <span key={i} style={{
                    background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
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
    const [editStatusCell, setEditStatusCell] = useState(null)
    const [selectedCandidateForDetails, setSelectedCandidateForDetails] = useState(null)
    const [selectedCellText, setSelectedCellText] = useState(null)

    useEffect(() => {
        Promise.all([
            axios.get(`${import.meta.env.VITE_API_URL || ''}/api/candidates`),
            axios.get(`${import.meta.env.VITE_API_URL || ''}/api/columns`)
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
            await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/columns`, {
                col_key: newColLabel,
                col_label: newColLabel,
                description: newColDesc
            });
            const cols = await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/columns`);
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

    const handleDeleteCandidate = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name || 'this candidate'}?`)) return;
        try {
            await axios.delete(`${import.meta.env.VITE_API_URL || ''}/api/candidates/${id}`);
            setCandidates(prev => prev.filter(c => c.id !== id));
        } catch (e) {
            alert('Failed to delete candidate: ' + (e.response?.data?.detail || e.message));
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
                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
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
                                {filteredCandidates.map((c, i) => (
                                    <tr key={i} style={{
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
                                                                        await axios.put(`${import.meta.env.VITE_API_URL || ''}/api/candidates/${c.id}`, { candidate_status: newVal });
                                                                        setCandidates(prev => prev.map((cand) => cand.id === c.id ? { ...cand, candidate_status: newVal } : cand));
                                                                    } catch (err) {
                                                                        alert('Save failed: ' + (err.response?.data?.detail || err.message));
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

                                                return (
                                                    <td
                                                        key={col.col_key}
                                                        onClick={() => setEditStatusCell({ candidateId: c.id })}
                                                        style={{ padding: '10px 12px', verticalAlign: 'top', cursor: 'pointer' }}
                                                    >
                                                        <span style={{
                                                            background: bg, color: color, border: border,
                                                            borderRadius: 5, padding: '2px 8px', fontSize: '0.73rem',
                                                            fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
                                                            textTransform: 'capitalize'
                                                        }}>
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
                                ))}
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
                        window.open(`${import.meta.env.VITE_API_URL || ''}/static/${filename}`, '_blank');
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
        </div>
    )
}

