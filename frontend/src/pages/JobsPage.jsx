import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Briefcase, Plus, Trash2, Search, UserCheck, Loader, ChevronRight, Edit, Calendar, User, Building, DollarSign, Award, Target, X, Phone, Eye, Filter, Check, FileText, Download, MoreVertical, Share2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils';
const API_URL = import.meta.env.VITE_API_URL || '';
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

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

/* ─── Candidate Details Modal ────────────────────────────────────────────── */
function CandidateDetailsModal({ candidate, onClose, onViewPdf, onToggleStatus }) {
    const [activeTab, setActiveTab] = React.useState('profile');
    const [jobs, setJobs] = React.useState([]);
    const [loadingJobs, setLoadingJobs] = React.useState(false);
    const [jobStatus, setJobStatus] = React.useState(candidate?.job_status || '');

    React.useEffect(() => {
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
                        {onToggleStatus && jobStatus && (
                            <button 
                                onClick={async () => {
                                    const nextStatus = jobStatus === 'selected' ? 'matched' : 'selected';
                                    try {
                                        await onToggleStatus(candidate.id, nextStatus);
                                        setJobStatus(nextStatus);
                                        // Also update local copy in object
                                        candidate.job_status = nextStatus;
                                    } catch (err) {
                                        console.error("Failed to toggle status", err);
                                    }
                                }}
                                style={{
                                    background: jobStatus === 'selected' ? 'rgba(45, 212, 191, 0.15)' : 'rgba(var(--gold-rgb), 0.15)',
                                    border: jobStatus === 'selected' ? '1px solid rgba(45, 212, 191, 0.35)' : '1px solid rgba(var(--gold-rgb), 0.35)',
                                    color: jobStatus === 'selected' ? '#2dd4bf' : 'var(--gold)',
                                    cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                    fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                    outline: 'none'
                                }}
                            >
                                {jobStatus === 'selected' ? '✓ Selected for Job' : '➕ Select Candidate'}
                            </button>
                        )}
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
    const [copied, setCopied] = React.useState(false);
    
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

/* ─── Column config ───────────────────────────────────────────────────────── */
const BASE_WIDTHS = {
    full_name: '150px', total_experience: '90px', pega_experience: '90px',
    cdh_exp: '90px', ctc: '100px', expected_ctc: '100px', percentage_hike: '90px',
    candidate_interview_status: '130px', candidate_status: '130px', availability_in_days: '100px', notice_period: '90px',
    phone: '130px', email: '180px', linkedin: '120px', current_location: '120px',
    pref_locations: '120px', current_organization: '150px', current_client: '150px',
    domain: '120px', tier: '90px', certification_version: '100px',
    skills: '200px', certifications: '180px', notescomments: '180px',
    ai_reason: '320px', source: '120px'
}

const TH = {
    padding: '11px 10px',
    textAlign: 'left',
    fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.73rem',
    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05rem',
    borderBottom: '2px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.97)',
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
}

const TD_BASE = {
    padding: '10px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid rgba(var(--sky-rgb), 0.07)',
    overflow: 'hidden',
}

export default function JobsPage() {
    const { user } = useOutletContext();
    const isExternal = user?.is_external === 1;

    const [jobs, setJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newJob, setNewJob] = useState({
        title: '',
        description: '',
        client_name: '',
        client_phone: '',
        contact_name: '',
        account_manager: '',
        assigned_recruiter: '',
        target_date: '',
        job_type: 'Full time',
        job_status: 'In-progress',
        work_experience: 'None',
        industry: 'None',
        salary: '',
        required_skills: ''
    });
    const [isMatching, setIsMatching] = useState(false);
    const [activeTab, setActiveTab] = useState('matched'); // 'matched' or 'selected'
    const [toast, setToast] = useState(null);
    const [editingCandidate, setEditingCandidate] = useState(null);
    const [editName, setEditName] = useState('');
    const [editExp, setEditExp] = useState('');
    const [editSkills, setEditSkills] = useState('');
    const [editReason, setEditReason] = useState('');
    const [editCurrentLocation, setEditCurrentLocation] = useState('');
    const [editPrefLocations, setEditPrefLocations] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [statusFilter, setStatusFilter] = useState('All');
    const [viewingPdf, setViewingPdf] = useState(null);
    const [selectedCandidateForDetails, setSelectedCandidateForDetails] = useState(null);
    const [isEditingJdInline, setIsEditingJdInline] = useState(false);
    const [jdInlineValue, setJdInlineValue] = useState('');
    const [selectedCellText, setSelectedCellText] = useState(null);
    const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
    const [unmatchedCandidates, setUnmatchedCandidates] = useState([]);
    const [loadingUnmatched, setLoadingUnmatched] = useState(false);
    const [unmatchedSearchQuery, setUnmatchedSearchQuery] = useState('');

    const [editingJob, setEditingJob] = useState(null);
    const [editJobForm, setEditJobForm] = useState({
        title: '',
        description: '',
        client_name: '',
        client_phone: '',
        contact_name: '',
        account_manager: '',
        assigned_recruiter: '',
        target_date: '',
        job_type: 'Full time',
        job_status: 'In-progress',
        work_experience: 'None',
        industry: 'None',
        salary: '',
        required_skills: ''
    });
    const [isSavingJob, setIsSavingJob] = useState(false);
    
    // Sharing & External Roles states
    const [showDropdown, setShowDropdown] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [externalUsers, setExternalUsers] = useState([]);
    const [sharedUsernames, setSharedUsernames] = useState([]);
    const [loadingShares, setLoadingShares] = useState(false);

    // Dynamic Spreadsheet States
    const [searchQuery, setSearchQuery] = useState('');
    const [cols, setCols] = useState([]);
    const [showColVisibility, setShowColVisibility] = useState(false);
    const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);
    const [draggedColKey, setDraggedColKey] = useState(null);
    const [dragOverColKey, setDragOverColKey] = useState(null);
    const [columnFilters, setColumnFilters] = useState({});
    const [editCell, setEditCell] = useState(null);
    const [editVal, setEditVal] = useState('');

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

    const loadCols = () => axios.get(`${API_URL}/api/columns`).then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: BASE_WIDTHS[c.col_key] || '120px', col_key: c.col_key, col_label: c.col_label }))
        
        const filteredBase = base.filter(c => c.key !== 'full_name' && c.key !== 'candidate_status');
        const nameCol = base.find(c => c.key === 'full_name') || { key: 'full_name', label: 'Name', pct: '150px' };
        const aiReasonCol = { key: 'ai_reason', label: 'AI Match Reason', pct: '320px' };
        const statusCol = base.find(c => c.key === 'candidate_status') || { key: 'candidate_status', label: 'Candidate Status', pct: '130px' };
        
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '120px', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        
        const allLoaded = [
            nameCol,
            aiReasonCol,
            statusCol,
            ...filteredBase,
            ...custom,
            { key: '_actions', label: 'Actions', pct: '260px' }
        ]
        
        const savedOrder = localStorage.getItem('hire_ai_job_col_order')
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

    const loadJobs = async () => {
        try {
            const r = await axios.get(`${API_URL}/api/jobs`);
            setJobs(r.data);
            if (selectedJob) {
                const updated = r.data.find(j => j.id === selectedJob.id);
                if (updated) setSelectedJob(updated);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const loadCandidates = async (jobId) => {
        try {
            const r = await axios.get(`${API_URL}/api/jobs/${jobId}/candidates`);
            setCandidates(r.data);
        } catch (e) {
            console.error(e);
        }
    }

    const handleOpenShareModal = async () => {
        if (!selectedJob) return;
        setLoadingShares(true);
        setShowShareModal(true);
        try {
            const usersRes = await axios.get(`${API_URL}/api/admin/users`);
            const external = (usersRes.data || []).filter(u => u.is_external === 1);
            setExternalUsers(external);
            
            const sharesRes = await axios.get(`${API_URL}/api/jobs/${selectedJob.id}/shares`);
            setSharedUsernames(sharesRes.data || []);
        } catch (e) {
            showToast('Failed to load sharing details', 'error');
        } finally {
            setLoadingShares(false);
        }
    }

    const handleSaveShares = async () => {
        try {
            await axios.post(`${API_URL}/api/jobs/${selectedJob.id}/share`, { usernames: sharedUsernames });
            showToast('Sharing permissions updated successfully!');
            setShowShareModal(false);
        } catch (e) {
            showToast('Failed to save sharing permissions', 'error');
        }
    }

    useEffect(() => {
        loadJobs();
        loadCols();
    }, []);

    useEffect(() => {
        if (selectedJob) {
            loadCandidates(selectedJob.id);
            loadCols();
        }
    }, [selectedJob]);

    const handleCreateJob = async () => {
        if (!newJob.title || !newJob.description) return showToast('Title and Description are required', 'error');
        try {
            const r = await axios.post(`${API_URL}/api/jobs`, newJob);
            setJobs([r.data, ...jobs]);
            setShowNewForm(false);
            setNewJob({
                title: '',
                description: '',
                client_name: '',
                client_phone: '',
                contact_name: '',
                account_manager: '',
                assigned_recruiter: '',
                target_date: '',
                job_type: 'Full time',
                job_status: 'In-progress',
                work_experience: 'None',
                industry: 'None',
                salary: '',
                required_skills: ''
            });
            setSelectedJob(r.data);
            showToast('Job Created!');
        } catch (e) {
            showToast('Failed to create job', 'error');
        }
    }

    const handleDeleteJob = async (jobId) => {
        if (!window.confirm('Delete this job?')) return;
        try {
            await axios.delete(`${API_URL}/api/jobs/${jobId}`);
            setJobs(jobs.filter(j => j.id !== jobId));
            if (selectedJob?.id === jobId) setSelectedJob(null);
            showToast('Job Deleted');
        } catch (e) {
            showToast('Failed to delete job', 'error');
        }
    }

    const handleMatch = async () => {
        if (!selectedJob) return;
        setIsMatching(true);
        try {
            const r = await axios.post(`${API_URL}/api/jobs/${selectedJob.id}/match`);
            showToast(r.data.message);
            loadCandidates(selectedJob.id);
            loadJobs();
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed to match', 'error');
        }
        setIsMatching(false);
    }

    const handleOpenAddCandidateModal = async () => {
        if (!selectedJob) return;
        setLoadingUnmatched(true);
        setUnmatchedSearchQuery('');
        setShowAddCandidateModal(true);
        try {
            const r = await axios.get(`${API_URL}/api/jobs/${selectedJob.id}/unmatched-candidates`);
            setUnmatchedCandidates(r.data || []);
        } catch (e) {
            showToast('Failed to load unmatched candidates', 'error');
        } finally {
            setLoadingUnmatched(false);
        }
    }

    const handleAddCandidateManually = async (candidateId) => {
        if (!selectedJob || !candidateId) return;
        try {
            await axios.post(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${candidateId}`);
            showToast('Candidate manually matched to job!');
            loadCandidates(selectedJob.id);
            loadJobs();
            setShowAddCandidateModal(false);
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed to match candidate manually', 'error');
        }
    }

    const handleStatusChange = async (candidateId, newStatus) => {
        try {
            await axios.put(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${candidateId}`, { status: newStatus });
            
            // Auto-sync: Update candidate profile status in metadata
            const profileStatus = newStatus === 'selected' ? 'Selected' : 'New';
            try {
                await axios.put(`${API_URL}/api/candidates/${candidateId}`, { candidate_status: profileStatus });
            } catch (err) {
                console.error("Failed to sync candidate profile status", err);
            }

            loadCandidates(selectedJob.id);
            loadJobs();
            showToast(`Candidate moved to ${newStatus}`);
        } catch (e) {
            showToast('Failed to update status', 'error');
        }
    }

    const handleRemoveFromJob = async (candidateId) => {
        if (!window.confirm('Remove this candidate from this Job?')) return;
        try {
            await axios.delete(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${candidateId}`);
            loadCandidates(selectedJob.id);
            loadJobs();
            showToast('Candidate removed from job');
        } catch (e) {
            showToast('Failed to remove candidate', 'error');
        }
    }

    const handleDeleteCandidate = async (candidateId) => {
        if (!window.confirm('Delete this candidate completely from the database? This cannot be undone.')) return;
        try {
            await axios.delete(`${API_URL}/api/candidates/${candidateId}`);
            loadCandidates(selectedJob.id);
            loadJobs();
            showToast('Candidate deleted completely');
        } catch (e) {
            showToast('Failed to delete candidate', 'error');
        }
    }

    const handleSaveCandidateEdit = async () => {
        if (!editingCandidate) return;
        if (!editName.trim()) return showToast('Name cannot be empty', 'error');
        
        setIsSavingEdit(true);
        try {
            // 1. Update core candidate details
            await axios.put(`${API_URL}/api/candidates/${editingCandidate.id}`, {
                full_name: editName,
                total_experience: editExp,
                skills: editSkills,
                current_location: editCurrentLocation,
                pref_locations: editPrefLocations
            });
            
            // 2. Update Job Candidate specific details (AI Reason)
            await axios.put(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${editingCandidate.id}`, {
                ai_reason: editReason
            });
            
            showToast('Candidate details updated successfully!');
            loadCandidates(selectedJob.id);
            setEditingCandidate(null);
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed to update candidate details', 'error');
        } finally {
            setIsSavingEdit(false);
        }
    }

    const handleSaveJobEdit = async () => {
        if (!editingJob) return;
        if (!editJobForm.title.trim() || !editJobForm.description.trim()) {
            return showToast('Title and Description cannot be empty', 'error');
        }
        setIsSavingJob(true);
        try {
            const r = await axios.put(`${API_URL}/api/jobs/${editingJob.id}`, editJobForm);
            setJobs(jobs.map(j => j.id === editingJob.id ? r.data : j));
            setSelectedJob(r.data);
            showToast('Job updated and candidates re-matched successfully!');
            loadCandidates(editingJob.id);
            setEditingJob(null);
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed to update job description', 'error');
        } finally {
            setIsSavingJob(false);
        }
    }

    // Column visibility handlers
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

    // Drag-and-drop handlers
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
            localStorage.setItem('hire_ai_job_col_order', JSON.stringify(cols.map(c => c.key).filter(k => k !== '_actions')))
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

    // Inline edit cell handlers
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
            if (editCell.col === 'ai_reason') {
                await axios.put(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${c.id}`, { ai_reason: finalVal });
                setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, ai_reason: finalVal } : row));
            } else {
                await axios.put(`${API_URL}/api/candidates/${c.id}`, { [editCell.col]: finalVal });
                setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: finalVal } : row));
            }
            showToast('Saved!');
        } catch (e) { showToast(e.response?.data?.detail || 'Save failed', 'error') }
        setEditCell(null);
    }

    // Job Status Filtering & Sidebar/Dashboard search
    const filteredJobs = jobs.filter(j => {
        const matchesStatus = statusFilter === 'All' || j.job_status === statusFilter;
        const matchesSearch = searchQuery === '' || 
            j.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (j.client_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const filteredCandidates = candidates.filter(c => {
        if (c.job_status !== activeTab) return false;
        
        for (const [colKey, filterVal] of Object.entries(columnFilters)) {
            if (filterVal) {
                const cVal = String(c[colKey] || '').toLowerCase();
                if (!cVal.includes(filterVal.toLowerCase())) return false;
            }
        }
        return true;
    });

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left Sidebar: Job List */}
            <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--fh)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold)' }}>
                        Job Descriptions
                    </div>
                    {!isExternal && (
                        <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => setShowNewForm(true)}>
                            <Plus size={16} /> New Job Description
                        </button>
                    )}
                </div>
                
                {/* Status Filter */}
                <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 600 }}>Filter by Job Status</label>
                    <select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)} 
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.82rem' }}
                    >
                        <option value="All">All Jobs</option>
                        <option value="In-progress">In-progress</option>
                        <option value="On-hold">On-hold</option>
                        <option value="Filled">Filled</option>
                        <option value="Closed">Closed</option>
                    </select>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {filteredJobs.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem' }}>
                            No jobs found matching<br/>the selected status.
                        </div>
                    )}
                    {filteredJobs.map(job => (
                        <div 
                            key={job.id} 
                            onClick={() => { setSelectedJob(job); setShowNewForm(false); }}
                            style={{ 
                                padding: '1rem', borderRadius: '12px', marginBottom: '10px', cursor: 'pointer',
                                border: `1px solid ${selectedJob?.id === job.id ? 'var(--gold)' : 'var(--border)'}`,
                                background: selectedJob?.id === job.id ? 'rgba(var(--gold-rgb), 0.1)' : 'var(--input-bg)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ fontWeight: 700, color: selectedJob?.id === job.id ? 'var(--gold)' : 'var(--text)', marginBottom: '4px' }}>
                                {job.title}
                            </div>
                            {job.client_name && (
                                <div style={{ fontSize: '0.76rem', color: 'var(--sky-dim)', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🏢 Client: {job.client_name}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Search size={12}/> {job.matched_count} Matched
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <UserCheck size={12}/> {job.selected_count} Selected
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content: Job Details */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)' }}>
                {showNewForm ? (
                    <div style={{ padding: '3rem', maxWidth: '850px', margin: '0 auto', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', marginBottom: '1.5rem' }}>Create New Job Description</h2>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Job Title *</label>
                                <input value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. pega CSSA" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Client Name</label>
                                <input value={newJob.client_name} onChange={e => setNewJob({...newJob, client_name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. My company" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Client Phone</label>
                                <input value={newJob.client_phone} onChange={e => setNewJob({...newJob, client_phone: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. +1 555-0199" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Contact Name</label>
                                <input value={newJob.contact_name} onChange={e => setNewJob({...newJob, contact_name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. Sabari Shree" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Account Manager</label>
                                <input value={newJob.account_manager} onChange={e => setNewJob({...newJob, account_manager: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. Sabari Shree" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Assigned Recruiter(s)</label>
                                <input value={newJob.assigned_recruiter} onChange={e => setNewJob({...newJob, assigned_recruiter: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="Recruiter Name" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Target Date</label>
                                <input type="date" value={newJob.target_date} onChange={e => setNewJob({...newJob, target_date: e.target.value})} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Job Type</label>
                                <select value={newJob.job_type} onChange={e => setNewJob({...newJob, job_type: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', height: 'auto' }}>
                                    <option value="Full time">Full time</option>
                                    <option value="Part time">Part time</option>
                                    <option value="Contract">Contract</option>
                                    <option value="Temporary">Temporary</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Job Opening Status</label>
                                <select value={newJob.job_status} onChange={e => setNewJob({...newJob, job_status: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', height: 'auto' }}>
                                    <option value="In-progress">In-progress</option>
                                    <option value="On-hold">On-hold</option>
                                    <option value="Filled">Filled</option>
                                    <option value="Closed">Closed</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Work Experience</label>
                                <select value={newJob.work_experience} onChange={e => setNewJob({...newJob, work_experience: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', height: 'auto' }}>
                                    <option value="None">None</option>
                                    <option value="Fresher">Fresher</option>
                                    <option value="1-3 years">1-3 years</option>
                                    <option value="3-5 years">3-5 years</option>
                                    <option value="5+ years">5+ years</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Industry</label>
                                <select value={newJob.industry} onChange={e => setNewJob({...newJob, industry: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', height: 'auto' }}>
                                    <option value="None">None</option>
                                    <option value="IT">IT</option>
                                    <option value="Finance">Finance</option>
                                    <option value="Healthcare">Healthcare</option>
                                    <option value="Telecom">Telecom</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Salary</label>
                                <input value={newJob.salary} onChange={e => setNewJob({...newJob, salary: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. 10 LPA" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Required Skills</label>
                                <input value={newJob.required_skills} onChange={e => setNewJob({...newJob, required_skills: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }} placeholder="e.g. Pega, CSSA" />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-dim)' }}>Job Description *</label>
                            <textarea 
                                value={newJob.description} 
                                onChange={e => setNewJob({...newJob, description: e.target.value})}
                                style={{ width: '100%', minHeight: '120px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical', outline: 'none' }}
                                placeholder="Paste the full job description here..."
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowNewForm(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreateJob}>Create Job Description</button>
                        </div>
                    </div>
                ) : selectedJob ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                        <div style={{ padding: '2rem', borderBottom: '1px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.15)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', margin: 0 }}>{selectedJob.title}</h2>
                                        
                                        {/* Status Badge */}
                                        <span style={{
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            padding: '4px 10px',
                                            borderRadius: '20px',
                                            textTransform: 'uppercase',
                                            background: selectedJob.job_status === 'In-progress' ? 'rgba(34, 197, 94, 0.15)' :
                                                        selectedJob.job_status === 'On-hold' ? 'rgba(249, 115, 22, 0.15)' :
                                                        selectedJob.job_status === 'Closed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(33, 158, 188, 0.15)',
                                            color: selectedJob.job_status === 'In-progress' ? '#4ade80' :
                                                   selectedJob.job_status === 'On-hold' ? '#fdba74' :
                                                   selectedJob.job_status === 'Closed' ? '#fca5a5' : '#38bdf8',
                                            border: `1px solid ${
                                                selectedJob.job_status === 'In-progress' ? 'rgba(34, 197, 94, 0.3)' :
                                                selectedJob.job_status === 'On-hold' ? 'rgba(249, 115, 22, 0.3)' :
                                                selectedJob.job_status === 'Closed' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(33, 158, 188, 0.3)'
                                            }`
                                        }}>
                                            ● {selectedJob.job_status || 'In-progress'}
                                        </span>

                                        {/* Job Type Badge */}
                                        <span style={{
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            padding: '4px 10px',
                                            borderRadius: '20px',
                                            background: 'rgba(var(--sky-rgb), 0.1)',
                                            color: 'var(--sky-dim)',
                                            border: '1px solid rgba(var(--sky-rgb), 0.2)'
                                        }}>
                                            {selectedJob.job_type || 'Full time'}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                        Client: <strong style={{ color: 'var(--text)' }}>{selectedJob.client_name || 'N/A'}</strong>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {!isExternal && (
                                        <div style={{ position: 'relative' }}>
                                            <button 
                                                onClick={() => setShowDropdown(!showDropdown)} 
                                                style={{
                                                    background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                                    color: 'var(--gold)', cursor: 'pointer', padding: '8px', borderRadius: '8px',
                                                    display: 'flex', transition: 'all 0.2s', outline: 'none'
                                                }}
                                                title="Job Actions"
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            {showDropdown && (
                                                <div style={{
                                                    position: 'absolute', right: 0, top: '44px',
                                                    background: 'var(--navy-dark)', border: '1px solid var(--border)',
                                                    borderRadius: '8px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                                                    zIndex: 100, width: '180px', overflow: 'hidden'
                                                }}>
                                                    <button 
                                                        onClick={() => { setShowDropdown(false); handleOpenShareModal(); }}
                                                        style={{
                                                            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                                                            color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                            display: 'flex', alignItems: 'center', gap: '8px'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                        <Share2 size={14} /> Share Job
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setShowDropdown(false);
                                                            setEditingJob(selectedJob);
                                                            setEditJobForm({
                                                                title: selectedJob.title || '',
                                                                description: selectedJob.description || '',
                                                                client_name: selectedJob.client_name || '',
                                                                client_phone: selectedJob.client_phone || '',
                                                                contact_name: selectedJob.contact_name || '',
                                                                account_manager: selectedJob.account_manager || '',
                                                                assigned_recruiter: selectedJob.assigned_recruiter || '',
                                                                target_date: selectedJob.target_date || '',
                                                                job_type: selectedJob.job_type || 'Full time',
                                                                job_status: selectedJob.job_status || 'In-progress',
                                                                work_experience: selectedJob.work_experience || 'None',
                                                                industry: selectedJob.industry || 'None',
                                                                salary: selectedJob.salary || '',
                                                                required_skills: selectedJob.required_skills || ''
                                                            });
                                                        }}
                                                        style={{
                                                            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                                                            color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                            display: 'flex', alignItems: 'center', gap: '8px'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                        <Edit size={14} /> Edit Job
                                                    </button>
                                                    <button 
                                                        onClick={() => { setShowDropdown(false); handleDeleteJob(selectedJob.id); }}
                                                        style={{
                                                            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                                                            color: '#fca5a5', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                                                            display: 'flex', alignItems: 'center', gap: '8px'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                        <Trash2 size={14} /> Delete Job
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Zoho Recruit style parameters grid */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                gap: '1.25rem', 
                                padding: '1.25rem', 
                                background: 'rgba(var(--navy-dark-rgb), 0.4)', 
                                border: '1px solid var(--border)', 
                                borderRadius: '12px',
                                marginBottom: '1.5rem'
                            }}>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Client Phone</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Phone size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.client_phone || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Contact Name</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.contact_name || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Account Manager</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.account_manager || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Assigned Recruiter</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.assigned_recruiter || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Target Date</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Calendar size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.target_date || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Work Experience</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Award size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.work_experience || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Industry</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Briefcase size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.industry || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Salary</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <DollarSign size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.salary || '--'}
                                    </span>
                                </div>
                            </div>

                            {/* Required Skills Badges */}
                            {selectedJob.required_skills && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Required Skills</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {selectedJob.required_skills.split(',').map((skill, index) => {
                                            const trimmed = skill.trim();
                                            if (!trimmed) return null;
                                            return (
                                                <span key={index} style={{
                                                    fontSize: '0.78rem',
                                                    fontWeight: 600,
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    background: 'rgba(var(--sky-rgb), 0.15)',
                                                    color: 'var(--sky-dim)',
                                                    border: '1px solid rgba(var(--sky-rgb), 0.3)'
                                                }}>
                                                    {trimmed}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginBottom: '1.5rem' }}>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>
                                    Full Job Description {isEditingJdInline ? '(Editing)' : (!isExternal ? '(Double-click text below to edit)' : '')}
                                </span>
                                {isEditingJdInline ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <textarea
                                            value={jdInlineValue}
                                            onChange={e => setJdInlineValue(e.target.value)}
                                            style={{
                                                width: '100%', minHeight: '150px', padding: '12px',
                                                background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                                color: 'var(--text)', borderRadius: '8px', resize: 'vertical',
                                                outline: 'none', fontFamily: 'var(--fb)', fontSize: '0.9rem'
                                            }}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                onClick={() => setIsEditingJdInline(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                className="btn btn-primary" 
                                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                onClick={async () => {
                                                    try {
                                                        const updatedJobForm = {
                                                            title: selectedJob.title,
                                                            description: jdInlineValue,
                                                            client_name: selectedJob.client_name,
                                                            client_phone: selectedJob.client_phone,
                                                            contact_name: selectedJob.contact_name,
                                                            account_manager: selectedJob.account_manager,
                                                            assigned_recruiter: selectedJob.assigned_recruiter,
                                                            target_date: selectedJob.target_date,
                                                            job_type: selectedJob.job_type || 'Full time',
                                                            job_status: selectedJob.job_status || 'In-progress',
                                                            work_experience: selectedJob.work_experience || 'None',
                                                            industry: selectedJob.industry || 'None',
                                                            salary: selectedJob.salary,
                                                            required_skills: selectedJob.required_skills
                                                        };
                                                        const r = await axios.put(`${API_URL}/api/jobs/${selectedJob.id}`, updatedJobForm);
                                                        setJobs(jobs.map(j => j.id === selectedJob.id ? r.data : j));
                                                        setSelectedJob(r.data);
                                                        showToast('Job Description updated and re-matched successfully!');
                                                        loadCandidates(selectedJob.id);
                                                        setIsEditingJdInline(false);
                                                    } catch (err) {
                                                        showToast(err.response?.data?.detail || 'Failed to save job description', 'error');
                                                    }
                                                }}
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div 
                                        onDoubleClick={() => {
                                            if (!isExternal) {
                                                setJdInlineValue(selectedJob.description);
                                                setIsEditingJdInline(true);
                                            }
                                        }}
                                        title={!isExternal ? "Double-click to edit job description inline" : ""}
                                        style={{ 
                                            color: 'var(--text)', 
                                            fontSize: '0.9rem', 
                                            maxHeight: '150px', 
                                            overflowY: 'auto',
                                            padding: '12px',
                                            background: 'rgba(var(--navy-dark-rgb), 0.2)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            whiteSpace: 'pre-wrap',
                                            cursor: !isExternal ? 'pointer' : 'default'
                                        }}
                                        onMouseEnter={e => { if (!isExternal) e.currentTarget.style.borderColor = 'var(--gold)'; }}
                                        onMouseLeave={e => { if (!isExternal) e.currentTarget.style.borderColor = 'var(--border)'; }}
                                    >
                                        {selectedJob.description}
                                    </div>
                                )}
                            </div>
                            
                            {!isExternal && (
                                <button 
                                    className="btn btn-primary" 
                                    onClick={handleMatch}
                                    disabled={isMatching}
                                    style={{ width: 'fit-content' }}
                                >
                                    {isMatching ? <Loader className="spin" size={16} /> : <Search size={16} />}
                                    {isMatching ? 'Finding Perfect Matches...' : 'Match Job Description'}
                                </button>
                            )}
                        </div>

                        {!isExternal && (
                            <>
                                {/* Tabs */}
                                <div style={{ padding: '1rem 2rem 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
                                    <button 
                                        onClick={() => setActiveTab('matched')}
                                        style={{ 
                                            padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: `3px solid ${activeTab === 'matched' ? 'var(--gold)' : 'transparent'}`,
                                            color: activeTab === 'matched' ? 'var(--gold)' : 'var(--text-dim)', fontWeight: activeTab === 'matched' ? 700 : 500, cursor: 'pointer',
                                            fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                                        }}
                                    >
                                        <Search size={16}/> Matched ({selectedJob.matched_count})
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('selected')}
                                        style={{ 
                                            padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: `3px solid ${activeTab === 'selected' ? 'var(--primary)' : 'transparent'}`,
                                            color: activeTab === 'selected' ? 'var(--primary)' : 'var(--text-dim)', fontWeight: activeTab === 'selected' ? 700 : 500, cursor: 'pointer',
                                            fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                                        }}
                                    >
                                        <UserCheck size={16}/> Selected ({selectedJob.selected_count})
                                    </button>
                                </div>

                                {/* Candidates List Spreadsheet Table */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: '15px' }}>
                                        {/* Columns Selector Popover */}
                                        <div style={{ position: 'relative' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                onClick={() => setShowColVisibility(!showColVisibility)} 
                                                style={{ gap: 6, color: 'var(--text)', borderColor: 'var(--border)', padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                                            >
                                                <Eye size={14} /> Columns
                                            </button>
                                            
                                            {showColVisibility && (
                                                <div 
                                                    onClick={e => e.stopPropagation()}
                                            style={{
                                                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 100,
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
                                <button
                                    className="btn btn-secondary"
                                    style={{ gap: 6, padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                                    onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, activeCols.filter(c => c.key !== '_actions')), `job_${selectedJob.title.replace(/\s+/g, '_')}_candidates.xlsx`)}
                                >
                                    <Download size={14} /> Download Excel
                                </button>
                            </div>
 
                            {filteredCandidates.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem', padding: '3rem', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                    <Search size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                    <p style={{ margin: 0 }}>
                                        {activeTab === 'matched' ? 'No candidates matched yet. Click "Match Job Description" to find perfect matches in your database.' : 'No candidates selected yet. Select them from the Matched tab.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-darker)' }}>
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
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (window.confirm(`Are you sure you want to hide the "${c.label}" column?`)) {
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
                                                {filteredCandidates.map((row, ri) => (
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
                                                                        overflow: 'visible',
                                                                        verticalAlign: 'middle'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                                        {activeTab === 'matched' ? (
                                                                            <button className="btn btn-primary" onClick={() => handleStatusChange(row.id, 'selected')} style={{ fontSize: '0.73rem', padding: '5px 9px' }} title="Select candidate for job">
                                                                                Select <ChevronRight size={12}/>
                                                                            </button>
                                                                        ) : (
                                                                            <>
                                                                                <button className="btn btn-secondary" onClick={() => handleStatusChange(row.id, 'matched')} style={{ fontSize: '0.73rem', padding: '5px 9px', borderColor: 'var(--border)' }} title="Remove Selection">
                                                                                    Deselect
                                                                                </button>
                                                                                {row.email && (
                                                                                    <button 
                                                                                        className="btn btn-primary" 
                                                                                        onClick={() => {
                                                                                            const subject = encodeURIComponent(`Congratulations! You have been selected for ${selectedJob.title} at ${selectedJob.client_name || 'Alamaticz'}`);
                                                                                            const body = encodeURIComponent(`Dear ${row.full_name},\n\nWe are pleased to inform you that you have been selected for the position of ${selectedJob.title} at ${selectedJob.client_name || 'our company'}.\n\nWe were highly impressed by your experience and credentials.\nOur recruitment team will contact you shortly with the official offer letter and next onboarding steps.\n\nBest regards,\nRecruitment Team\nAlamaticz Solutions`);
                                                                                            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${row.email}&su=${subject}&body=${body}`;
                                                                                            window.open(gmailUrl, '_blank');
                                                                                        }} 
                                                                                        style={{ fontSize: '0.73rem', padding: '5px 9px', background: 'rgba(var(--sky-rgb), 0.15)', borderColor: 'rgba(var(--sky-rgb), 0.3)', color: 'var(--sky-dim)' }} 
                                                                                        title="Send congratulations email via Gmail"
                                                                                    >
                                                                                        ✉ Send Gmail
                                                                                    </button>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                        <button className="btn btn-secondary" onClick={() => {
                                                                            setEditingCandidate(row);
                                                                            setEditName(row.full_name || row.filename || '');
                                                                            setEditExp(row.total_experience || '0');
                                                                            setEditSkills(row.skills || '');
                                                                            setEditReason(row.ai_reason || '');
                                                                            setEditCurrentLocation(row.current_location || '');
                                                                            setEditPrefLocations(row.pref_locations || '');
                                                                        }} style={{ fontSize: '0.73rem', padding: '5px 9px', borderColor: 'rgba(var(--gold-rgb), 0.3)', color: 'var(--gold)' }} title="Edit candidate details">
                                                                            <Edit size={12}/> Edit
                                                                        </button>
                                                                        <button className="btn btn-secondary" onClick={() => handleRemoveFromJob(row.id)} style={{ fontSize: '0.73rem', padding: '5px 9px', borderColor: 'rgba(var(--sky-rgb), 0.3)', color: 'var(--sky)' }} title="Remove candidate from this job description mapping">
                                                                            Remove
                                                                        </button>
                                                                        <button className="btn btn-danger" onClick={() => handleDeleteCandidate(row.id)} style={{ fontSize: '0.73rem', padding: '5px 9px' }} title="Delete candidate permanently from database">
                                                                            <Trash2 size={12}/> Delete
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
                                                                                 onBlur={() => setTimeout(() => setEditCell(null), 200)}
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
 
                                                            /* ── Expandable (skills / certs) ── */
                                                            if (isExpandable) return (
                                                                <td key={key} style={{ ...TD_BASE, verticalAlign: 'middle' }} onDoubleClick={() => startEdit(ri, key, val)}>
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
                                                                         if (key !== 'candidate_status' && key !== 'full_name') {
                                                                             const colLabel = cols.find(c => c.key === key)?.label || key;
                                                                             if (String(val).length > 25 || key === 'ai_reason' || key === 'notescomments' || key === 'skills' || key === 'certifications') {
                                                                                 setSelectedCellText({ title: colLabel, text: String(val || '') });
                                                                             } else {
                                                                                 startEdit(ri, key, val);
                                                                             }
                                                                         }
                                                                     }} style={{
                                                                    ...TD_BASE,
                                                                    color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                                                    fontWeight: key === 'full_name' ? 700 : undefined,
                                                                    whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                                                        ? 'normal' : 'nowrap',
                                                                    wordBreak: key === 'email' ? 'break-all' : undefined,
                                                                    cursor: key === 'candidate_status' ? 'pointer' : 'text',
                                                                    verticalAlign: 'middle'
                                                                }}>
                                                                    {key === 'full_name' ? (
                                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={row.job_status === 'selected'}
                                                                                onChange={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleStatusChange(row.id, row.job_status === 'selected' ? 'matched' : 'selected');
                                                                                }}
                                                                                title={row.job_status === 'selected' ? 'Deselect Candidate for Job Role' : 'Select Candidate for Job Role'}
                                                                                style={{
                                                                                    cursor: 'pointer',
                                                                                    width: '16px',
                                                                                    height: '16px',
                                                                                    accentColor: 'var(--gold)',
                                                                                    flexShrink: 0
                                                                                }}
                                                                            />
                                                                            <span
                                                                                onClick={() => setSelectedCandidateForDetails(row)}
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
                                                                                {display}
                                                                                {row.is_qualified ? (
                                                                                    <span style={{ fontSize: '0.72rem', background: 'rgba(var(--gold-rgb), 0.2)', padding: '2px 6px', borderRadius: '10px', color: 'var(--gold)', marginLeft: '6px' }} title="Qualified candidate">
                                                                                        ⭐ Qualified
                                                                                    </span>
                                                                                ) : null}
                                                                            </span>
                                                                        </div>
                                                                    ) : key === 'email' && val ? (
                                                                        <a 
                                                                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${val}`} 
                                                                            target="_blank" 
                                                                            rel="noreferrer" 
                                                                            title="Send email via Gmail" 
                                                                            style={{ color: 'var(--sky-dim)', textDecoration: 'underline', cursor: 'pointer' }}
                                                                            onClick={e => e.stopPropagation()}
                                                                        >
                                                                            {display}
                                                                        </a>
                                                                    ) : (
                                                                        display
                                                                    )}
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.38)' }}>
                                        💡 Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click any cell to edit
                                    </p>
                                </>
                            )}
                        </div>
                    </>
                )}
                    </div>
                ) : (
                    <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                        {/* Dashboard Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Briefcase size={28} /> Job Status Grid Dashboard
                                </h2>
                                <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                                    Overview of all open jobs and their candidate funnel status.
                                </p>
                            </div>
                            
                            {/* Dashboard Search */}
                            <div style={{ position: 'relative', width: '300px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search by title or client name..."
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px 10px 38px',
                                        background: 'var(--input-bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        color: 'var(--text)',
                                        fontSize: '0.88rem',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Status Stats Overview Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                            {['In-progress', 'On-hold', 'Filled', 'Closed'].map(status => {
                                const count = jobs.filter(j => j.job_status === status).length;
                                const isActive = statusFilter === status;
                                
                                return (
                                    <div 
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        style={{
                                            padding: '1.25rem',
                                            borderRadius: '12px',
                                            background: isActive ? 'rgba(var(--gold-rgb), 0.12)' : 'rgba(var(--navy-dark-rgb), 0.3)',
                                            border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            textAlign: 'center',
                                            transform: isActive ? 'scale(1.03)' : 'scale(1)'
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'rgba(var(--sky-rgb), 0.5)' }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
                                    >
                                        <span style={{ display: 'block', fontSize: '0.8rem', color: isActive ? 'var(--gold)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05rem', fontWeight: 600 }}>
                                            {status}
                                        </span>
                                        <span style={{ display: 'block', fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '6px' }}>
                                            {count}
                                        </span>
                                    </div>
                                );
                            })}
                            <div 
                                onClick={() => setStatusFilter('All')}
                                style={{
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    background: statusFilter === 'All' ? 'rgba(var(--gold-rgb), 0.12)' : 'rgba(var(--navy-dark-rgb), 0.3)',
                                    border: `1px solid ${statusFilter === 'All' ? 'var(--gold)' : 'var(--border)'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'center',
                                    transform: statusFilter === 'All' ? 'scale(1.03)' : 'scale(1)'
                                }}
                                onMouseEnter={e => { if (statusFilter !== 'All') e.currentTarget.style.borderColor = 'rgba(var(--sky-rgb), 0.5)' }}
                                onMouseLeave={e => { if (statusFilter !== 'All') e.currentTarget.style.borderColor = 'var(--border)' }}
                            >
                                <span style={{ display: 'block', fontSize: '0.8rem', color: statusFilter === 'All' ? 'var(--gold)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05rem', fontWeight: 600 }}>
                                    Total Jobs
                                </span>
                                <span style={{ display: 'block', fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '6px' }}>
                                    {jobs.length}
                                </span>
                            </div>
                        </div>

                        {/* Jobs Grid */}
                        <div style={{ flex: 1, marginTop: '0.5rem' }}>
                            {filteredJobs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-dim)', background: 'rgba(var(--navy-dark-rgb), 0.1)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <Briefcase size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <h4 style={{ color: 'var(--text)', margin: '0 0 8px 0' }}>No jobs match your selection</h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem' }}>Try clearing filters or search to view other job postings, or create a new job profile.</p>
                                    {(statusFilter !== 'All' || searchQuery) && (
                                        <button 
                                            className="btn btn-secondary" 
                                            style={{ marginTop: '1.2rem' }}
                                            onClick={() => { setStatusFilter('All'); setSearchQuery(''); }}
                                        >
                                            Reset Filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                                    {filteredJobs.map(job => (
                                        <div 
                                            key={job.id}
                                            style={{
                                                background: 'var(--bg-darker)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                padding: '1.5rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '1rem',
                                                transition: 'all 0.25s',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                            onClick={() => setSelectedJob(job)}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.borderColor = 'var(--gold)';
                                                e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.borderColor = 'var(--border)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            {/* Status and Type Badges top row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '3px 8px',
                                                    borderRadius: '12px',
                                                    textTransform: 'uppercase',
                                                    background: job.job_status === 'In-progress' ? 'rgba(34, 197, 94, 0.12)' :
                                                                job.job_status === 'On-hold' ? 'rgba(249, 115, 22, 0.12)' :
                                                                job.job_status === 'Closed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(33, 158, 188, 0.12)',
                                                    color: job.job_status === 'In-progress' ? '#4ade80' :
                                                           job.job_status === 'On-hold' ? '#fdba74' :
                                                           job.job_status === 'Closed' ? '#fca5a5' : '#38bdf8',
                                                    border: `1px solid ${
                                                        job.job_status === 'In-progress' ? 'rgba(34, 197, 94, 0.2)' :
                                                        job.job_status === 'On-hold' ? 'rgba(249, 115, 22, 0.2)' :
                                                        job.job_status === 'Closed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(33, 158, 188, 0.2)'
                                                    }`
                                                }}>
                                                    ● {job.job_status || 'In-progress'}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(var(--sky-rgb), 0.08)', padding: '2px 8px', borderRadius: '4px' }}>
                                                    {job.job_type || 'Full time'}
                                                </span>
                                            </div>

                                            {/* Job Title and Client */}
                                            <div>
                                                <h4 style={{ margin: 0, color: 'var(--gold)', fontSize: '1.15rem', fontFamily: 'var(--fh)', fontWeight: 800 }}>{job.title}</h4>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                                                    Client: <strong style={{ color: 'var(--text)' }}>{job.client_name || 'N/A'}</strong>
                                                </span>
                                            </div>

                                            {/* Required Skills tags */}
                                            {job.required_skills && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {job.required_skills.split(',').slice(0, 3).map((skill, index) => {
                                                        const s = skill.trim();
                                                        if (!s) return null;
                                                        return (
                                                            <span key={index} style={{ fontSize: '0.72rem', background: 'rgba(var(--sky-rgb), 0.08)', color: 'var(--sky-dim)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                                                                {s}
                                                            </span>
                                                        );
                                                    })}
                                                    {job.required_skills.split(',').length > 3 && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                                            +{job.required_skills.split(',').length - 3} more
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Counters Funnel */}
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: '1fr 1fr', 
                                                gap: '8px', 
                                                padding: '10px', 
                                                background: 'rgba(var(--navy-dark-rgb), 0.4)', 
                                                border: '1px solid var(--border)', 
                                                borderRadius: '8px',
                                                textAlign: 'center',
                                                marginTop: 'auto'
                                            }}>
                                                <div>
                                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Matched</span>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                        <Search size={13} style={{ color: 'var(--gold)' }} /> {job.matched_count}
                                                    </strong>
                                                </div>
                                                <div style={{ borderLeft: '1px solid var(--border)' }}>
                                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Selected</span>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                        <UserCheck size={13} style={{ color: 'var(--primary)' }} /> {job.selected_count}
                                                    </strong>
                                                </div>
                                            </div>

                                            {/* Details Button and Delete Icon */}
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ flex: 1, padding: '7px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedJob(job);
                                                    }}
                                                >
                                                    Open Details <ChevronRight size={14} />
                                                </button>
                                                {!isExternal && (
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '7px', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteJob(job.id);
                                                        }}
                                                        title="Delete job description completely"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editingCandidate && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '500px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--fh)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Edit Candidate & Match Details</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Full Name</label>
                                <input 
                                    type="text" 
                                    value={editName} 
                                    onChange={e => setEditName(e.target.value)} 
                                    placeholder="e.g. John Doe" 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Total Experience (years)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    value={editExp} 
                                    onChange={e => setEditExp(e.target.value)} 
                                    placeholder="e.g. 5.5" 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Skills (comma separated)</label>
                                <textarea 
                                    value={editSkills} 
                                    onChange={e => setEditSkills(e.target.value)} 
                                    placeholder="e.g. Pega, Java, SQL" 
                                    rows={2}
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Current Location</label>
                                <input 
                                    type="text" 
                                    value={editCurrentLocation} 
                                    onChange={e => setEditCurrentLocation(e.target.value)} 
                                    placeholder="e.g. Chennai" 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Preferred Locations (comma separated)</label>
                                <input 
                                    type="text" 
                                    value={editPrefLocations} 
                                    onChange={e => setEditPrefLocations(e.target.value)} 
                                    placeholder="e.g. Chennai, Bangalore" 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>🤖 AI Match Reason</label>
                                <textarea 
                                    value={editReason} 
                                    onChange={e => setEditReason(e.target.value)} 
                                    placeholder="Explanation of how the candidate fits this job description" 
                                    rows={3}
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setEditingCandidate(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveCandidateEdit} disabled={isSavingEdit}>
                                {isSavingEdit ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {editingJob && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '800px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--fh)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Edit Job Description</h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Job Title *</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.title} 
                                    onChange={e => setEditJobForm({...editJobForm, title: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Client Name</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.client_name} 
                                    onChange={e => setEditJobForm({...editJobForm, client_name: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Client Phone</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.client_phone} 
                                    onChange={e => setEditJobForm({...editJobForm, client_phone: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Contact Name</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.contact_name} 
                                    onChange={e => setEditJobForm({...editJobForm, contact_name: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Account Manager</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.account_manager} 
                                    onChange={e => setEditJobForm({...editJobForm, account_manager: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Assigned Recruiter(s)</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.assigned_recruiter} 
                                    onChange={e => setEditJobForm({...editJobForm, assigned_recruiter: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Target Date</label>
                                <input 
                                    type="date" 
                                    value={editJobForm.target_date} 
                                    onChange={e => setEditJobForm({...editJobForm, target_date: e.target.value})} 
                                    style={{ width: '100%', padding: '9px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Job Type</label>
                                <select 
                                    value={editJobForm.job_type} 
                                    onChange={e => setEditJobForm({...editJobForm, job_type: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none', height: 'auto' }}
                                >
                                    <option value="Full time">Full time</option>
                                    <option value="Part time">Part time</option>
                                    <option value="Contract">Contract</option>
                                    <option value="Temporary">Temporary</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Job Opening Status</label>
                                <select 
                                    value={editJobForm.job_status} 
                                    onChange={e => setEditJobForm({...editJobForm, job_status: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none', height: 'auto' }}
                                >
                                    <option value="In-progress">In-progress</option>
                                    <option value="On-hold">On-hold</option>
                                    <option value="Filled">Filled</option>
                                    <option value="Closed">Closed</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Work Experience</label>
                                <select 
                                    value={editJobForm.work_experience} 
                                    onChange={e => setEditJobForm({...editJobForm, work_experience: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none', height: 'auto' }}
                                >
                                    <option value="None">None</option>
                                    <option value="Fresher">Fresher</option>
                                    <option value="1-3 years">1-3 years</option>
                                    <option value="3-5 years">3-5 years</option>
                                    <option value="5+ years">5+ years</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Industry</label>
                                <select 
                                    value={editJobForm.industry} 
                                    onChange={e => setEditJobForm({...editJobForm, industry: e.target.value})} 
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none', height: 'auto' }}
                                >
                                    <option value="None">None</option>
                                    <option value="IT">IT</option>
                                    <option value="Finance">Finance</option>
                                    <option value="Healthcare">Healthcare</option>
                                    <option value="Telecom">Telecom</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Salary</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.salary} 
                                    onChange={e => setEditJobForm({...editJobForm, salary: e.target.value})} 
                                    placeholder="e.g. 10 LPA"
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Required Skills</label>
                                <input 
                                    type="text" 
                                    value={editJobForm.required_skills} 
                                    onChange={e => setEditJobForm({...editJobForm, required_skills: e.target.value})} 
                                    placeholder="e.g. Pega, CSSA"
                                    style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Job Description *</label>
                            <textarea 
                                value={editJobForm.description} 
                                onChange={e => setEditJobForm({...editJobForm, description: e.target.value})} 
                                placeholder="Paste the full job description here..." 
                                rows={6}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical', outline: 'none' }}
                            />
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setEditingJob(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveJobEdit} disabled={isSavingJob}>
                                {isSavingJob ? 'Saving & Re-matching...' : 'Save & Re-match'}
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
                        setSelectedCandidateForDetails(null);
                        setViewingPdf({ url: `${BACKEND_URL}/static/${filename}`, name });
                    }}
                    onToggleStatus={handleStatusChange}
                />
            )}
            
            {/* Cell Text Modal */}
            {selectedCellText && (
                <CellTextModal 
                    data={selectedCellText} 
                    onClose={() => setSelectedCellText(null)} 
                />
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
                        width: '95%', maxWidth: 1000, height: '90vh', 
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

            {/* Add Candidate Modal */}
            {showAddCandidateModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={() => setShowAddCandidateModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '90%', maxWidth: '500px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column', padding: 0,
                        border: '1px solid var(--border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        background: 'var(--navy-dark)'
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.95)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800 }}>
                                ➕ Add Candidate manually to Job
                            </h3>
                            <button onClick={() => setShowAddCandidateModal(false)} style={{
                                background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex'
                            }}>
                                <X size={18} />
                            </button>
                        </div>
                        
                        {/* Search Input */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.2)' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-dim)' }} />
                                <input 
                                    type="text"
                                    placeholder="Search candidate by name or email..."
                                    value={unmatchedSearchQuery}
                                    onChange={e => setUnmatchedSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 10px 10px 36px',
                                        background: 'rgba(var(--navy-dark-rgb), 0.8)', border: '1px solid var(--border)',
                                        color: 'var(--text)', borderRadius: 8, outline: 'none', fontSize: '0.88rem'
                                    }}
                                />
                            </div>
                        </div>
                        
                        {/* List Container */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {loadingUnmatched ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                                </div>
                            ) : unmatchedCandidates.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                    No candidates available to match.
                                </div>
                            ) : (() => {
                                const filtered = unmatchedCandidates.filter(c => {
                                    const q = unmatchedSearchQuery.toLowerCase();
                                    return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
                                });
                                
                                if (filtered.length === 0) {
                                    return (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                            No matching candidates found.
                                        </div>
                                    );
                                }
                                
                                return filtered.map(c => (
                                    <div 
                                        key={c.id}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid var(--border)', borderRadius: '8px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ overflow: 'hidden', marginRight: '12px' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {c.full_name || 'Unnamed Candidate'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                                Exp: {c.total_experience ? `${c.total_experience} yrs` : '—'} | notice: {c.notice_period || '—'}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleAddCandidateManually(c.id)}
                                            className="btn btn-primary"
                                            style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                                        >
                                            Match
                                        </button>
                                    </div>
                                ));
                            })()}
                        </div>
                        
                        {/* Footer */}
                        <div style={{
                            padding: '12px 24px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end',
                            background: 'rgba(var(--navy-rgb), 0.3)'
                        }}>
                            <button 
                                onClick={() => setShowAddCandidateModal(false)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {showShareModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)', zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={() => setShowShareModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '90%', maxWidth: '500px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column', padding: 0,
                        border: '1px solid var(--border)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        background: 'var(--navy-dark)'
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.95)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Share2 size={18} /> Share Job Profile
                            </h3>
                            <button onClick={() => setShowShareModal(false)} style={{
                                background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        
                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', color: 'var(--text)' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                                Select the external candidates/users who should be permitted to view this Job Description.
                            </p>
                            {loadingShares ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                                </div>
                            ) : externalUsers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                    No external users registered. Check the "External" role in Admin Portal to add external users.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {externalUsers.map(u => (
                                        <label 
                                            key={u.username} 
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: '12px', 
                                                padding: '10px 14px', background: 'rgba(255,255,255,0.02)', 
                                                border: '1px solid var(--border)', borderRadius: '8px',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            <input 
                                                type="checkbox"
                                                checked={sharedUsernames.includes(u.username)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSharedUsernames([...sharedUsernames, u.username]);
                                                    } else {
                                                        setSharedUsernames(sharedUsernames.filter(uname => uname !== u.username));
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--gold)' }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.full_name}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>@{u.username}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div style={{
                            padding: '12px 24px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end', gap: '10px',
                            background: 'rgba(var(--navy-rgb), 0.3)'
                        }}>
                            <button 
                                onClick={() => setShowShareModal(false)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveShares}
                                className="btn btn-primary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                                disabled={loadingShares || externalUsers.length === 0}
                            >
                                Save Shares
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
             {toast && (
                 <div className="toast-container">
                     <div className={`toast ${toast.type}`}>{toast.msg}</div>
                 </div>
             )}
        </div>
    );
}
