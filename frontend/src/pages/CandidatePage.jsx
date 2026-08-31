import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom'
import { ArrowLeft, Download, Eye, Trash2, FileText, Loader, Mail } from 'lucide-react'
import apiClient from '../api/client'
import ResumePreview from '../components/ResumePreview'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { useConfirm } from '../hooks/useConfirm'
import { usePageTitle } from '../hooks/usePageTitle'
import { statusChipClass } from '../utils/statusChip'
import { displayCandidateName } from '../utils/nameDisplay'
import { formatApiError } from '../utils/apiError'

const API = import.meta.env.VITE_API_URL || ''

// The résumé file endpoints are plain <iframe>/<a> GETs, which can't carry
// the axios auth headers - the backend also accepts the session token as a
// ?token= query param on /static and the export endpoints for exactly this.
function tokenParam() {
    try {
        const t = (JSON.parse(localStorage.getItem('hire_ai_user') || 'null') || {}).token
        return t ? `?token=${encodeURIComponent(t)}` : ''
    } catch { return '' }
}

const FIELDS = [
    ['email', 'Email address'], ['phone', 'Phone number'], ['linkedin', 'LinkedIn'],
    ['current_organization', 'Current organisation'], ['total_experience', 'Total experience'],
    ['pega_experience', 'Specialised experience'], ['cdh_exp', 'CDH experience'], ['notice_period', 'Notice period'],
    ['ctc', 'Current CTC'], ['expected_ctc', 'Expected CTC'], ['percentage_hike', 'Hike %'],
    ['current_location', 'Current location'], ['pref_locations', 'Preferred locations'],
]

export default function CandidatePage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useOutletContext() || {}
    const { confirm, confirmDialogProps } = useConfirm()

    const [candidate, setCandidate] = useState(location.state?.candidate || null)
    const [loading, setLoading] = useState(!location.state?.candidate)
    const [jobs, setJobs] = useState([])
    const [showFormatted, setShowFormatted] = useState(false)
    const [formatted, setFormatted] = useState(null)
    const [loadingFormatted, setLoadingFormatted] = useState(false)
    const [err, setErr] = useState('')

    usePageTitle(displayCandidateName(candidate?.full_name) || 'Candidate')

    useEffect(() => {
        if (candidate && String(candidate.id) === String(id)) { setLoading(false); return }
        setLoading(true)
        apiClient.get('/api/candidates')
            .then(res => setCandidate((res.data || []).find(c => String(c.id) === String(id)) || null))
            .catch(() => setCandidate(null))
            .finally(() => setLoading(false))
    }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!id) return
        apiClient.get(`/api/candidates/${id}/jobs`).then(r => setJobs(r.data || [])).catch(() => setJobs([]))
    }, [id])

    useEffect(() => {
        if (showFormatted && !formatted && id) {
            setLoadingFormatted(true)
            apiClient.get(`/api/candidates/${id}/formatted-resume`)
                .then(r => setFormatted(r.data)).catch(() => { }).finally(() => setLoadingFormatted(false))
        }
    }, [showFormatted, formatted, id])

    const filename = candidate?.filename || ''
    const isPdf = filename.toLowerCase().endsWith('.pdf')
    const hasFile = filename && !/\.(xlsx|xls|csv)$/i.test(filename)

    const handleDelete = async () => {
        if (!(await confirm({
            title: 'Delete this candidate?',
            message: 'This removes the candidate and their parsed résumé. It cannot be undone.',
            confirmLabel: 'Delete', danger: true,
        }))) return
        try {
            await apiClient.delete(`/api/candidates/${id}`)
            navigate(-1)
        } catch (e) {
            setErr(formatApiError(e, 'Failed to delete candidate'))
        }
    }

    const name = displayCandidateName(candidate?.full_name) || 'Candidate'
    const status = String(candidate?.candidate_status || 'New').trim()

    if (loading) return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
            <Loader className="spin" size={26} style={{ color: 'var(--action)' }} />
        </div>
    )

    if (!candidate) return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(-1)}>
                <ArrowLeft size={14} /> Back
            </button>
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>Candidate not found.</div>
        </div>
    )

    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ConfirmDialog {...confirmDialogProps} />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        <ArrowLeft size={14} /> Back
                    </button>
                    <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--action-quiet-bg)', color: 'var(--action)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h1 style={{ fontFamily: 'var(--fh)', fontSize: 'var(--fs-7)', fontWeight: 600, margin: 0 }}>{name}</h1>
                            <span className={statusChipClass(status)}>{status}</span>
                        </div>
                        <div style={{ fontSize: 'var(--fs-2)', color: 'var(--text-dim)' }}>
                            {[candidate.current_organization, candidate.current_location, candidate.source || 'Résumé upload']
                                .filter(Boolean).join(' · ')}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {hasFile && (
                        <button type="button" className={`btn ${showFormatted ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowFormatted(v => !v)}>
                            <Eye size={14} /> {showFormatted ? 'Show original résumé' : 'View Alamaticz format'}
                        </button>
                    )}
                    <a className="btn btn-secondary" style={{ textDecoration: 'none' }} href={`${API}/api/candidates/${id}/export-docx${tokenParam()}`}>
                        <Download size={14} /> Alamaticz DOCX
                    </a>
                    <button type="button" className="btn btn-danger" onClick={handleDelete}>
                        <Trash2 size={14} /> Delete
                    </button>
                </div>
            </div>

            {err && (
                <div role="alert" style={{ background: 'var(--danger-bg)', color: 'var(--danger-fg)', border: '1px solid var(--danger-fg)', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 'var(--fs-3)' }}>
                    {err}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Parsed profile */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                        <div style={{ fontSize: 'var(--fs-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 10 }}>Parsed profile</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px 18px' }}>
                            {FIELDS.map(([k, label]) => (
                                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                                    <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-subtle)' }}>{label}</span>
                                    <span style={{ fontSize: 'var(--fs-3)', fontFamily: /exp|ctc|hike|notice|phone/.test(k) ? 'var(--fm)' : 'inherit', overflowWrap: 'anywhere' }}>
                                        {candidate[k] || '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 'var(--fs-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 10 }}>Skills &amp; certifications</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[...String(candidate.skills || '').split(','), ...String(candidate.certifications || '').split(',')]
                                .map(s => s.trim()).filter(Boolean)
                                .map((s, i) => (
                                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-2)' }}>{s}</span>
                                ))}
                            {!candidate.skills && !candidate.certifications && <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--fs-3)' }}>None parsed</span>}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 'var(--fs-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 10 }}>Matched &amp; selected jobs</div>
                        {jobs.length === 0 ? (
                            <div style={{ fontSize: 'var(--fs-3)', color: 'var(--text-dim)', padding: '10px 0' }}>Not linked to any job yet.</div>
                        ) : (
                            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                                {jobs.map((j, i) => (
                                    <div key={i} style={{ padding: '11px 14px', borderBottom: i < jobs.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                            <span style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>{j.title}</span>
                                            <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-dim)' }}>{j.client_name || '—'}</span>
                                        </div>
                                        <span className={statusChipClass(j.match_status === 'selected' ? 'Selected' : 'New')}>{j.match_status || 'matched'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {candidate.email && (
                        <a className="btn btn-secondary" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${candidate.email}`} target="_blank" rel="noreferrer">
                            <Mail size={14} /> Email candidate
                        </a>
                    )}
                </div>

                {/* Résumé panel */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} style={{ color: 'var(--text-dim)' }} />
                        <span style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>{showFormatted ? 'Alamaticz format' : 'Original résumé'}</span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, background: '#e9eaed', display: 'flex' }}>
                        {showFormatted ? (
                            loadingFormatted ? (
                                <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-dim)' }}>
                                    <Loader className="spin" size={24} /> Generating formatted résumé…
                                </div>
                            ) : formatted ? (
                                <div style={{ flex: 1, overflow: 'auto' }}><ResumePreview data={formatted} templateId="alamaticz" /></div>
                            ) : (
                                <div style={{ margin: 'auto', color: 'var(--text-dim)', fontSize: 'var(--fs-3)' }}>No formatted résumé available.</div>
                            )
                        ) : hasFile && isPdf ? (
                            <iframe title="Résumé" style={{ flex: 1, border: 'none' }} src={`${API}/static/${filename}${tokenParam()}#view=FitH`} />
                        ) : hasFile ? (
                            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 12, padding: 32 }}>
                                <FileText size={32} style={{ margin: '0 auto', color: 'var(--text-subtle)' }} />
                                <div>Preview isn&rsquo;t supported for this file type.</div>
                                <a className="btn btn-secondary" style={{ alignSelf: 'center', textDecoration: 'none' }} href={`${API}/static/${filename}${tokenParam()}`} download={filename}>
                                    <Download size={14} /> Download résumé
                                </a>
                            </div>
                        ) : (
                            <div style={{ margin: 'auto', color: 'var(--text-dim)', fontSize: 'var(--fs-3)' }}>No résumé file on record.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
