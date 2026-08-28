import { useState, useEffect } from 'react'
import { Download, Trash2, FileText, X, Loader, Edit, Check, Eye, Plus } from 'lucide-react'
import apiClient, { getStaticUrl } from '../../api/client'
import alamaticzLogo from '../../assets/alamaticz-logo.jpg'
import ResumePreview, { getResumeHtml } from '../ResumePreview'
import ResumeEditor from './ResumeEditor'
import { formatDate } from '../../utils/formatters'
import { useToast } from '../../hooks/useToast'
import ToastHost from './ToastHost'
import { useModalA11y } from '../../hooks/useModalA11y'

/**
 * Full candidate details modal: profile fields, matched/selected jobs
 * table, embedded resume viewer (PDF iframe / non-PDF download prompt),
 * and — depending on props — a "formatted" (Alamaticz-format) resume
 * panel that can be viewed and/or edited.
 *
 * Extracted from three near-duplicate ~450-670 line implementations:
 *   - JobsPage.jsx `CandidateDetailsModal` (~line 603) — the most
 *     feature-complete original: status toggle ("Select Candidate"),
 *     delete, DOCX export, and a *working* formatted-resume panel
 *     (auto-shown once `job_status === 'selected'`) with template
 *     switching and full edit/save via `ResumeEditor`.
 *   - DashboardPage.jsx `CandidateDetailsModal` (~line 11) — no status
 *     toggle, no delete, a "View Alamaticz Format" header button that set
 *     `showAlamaticz`/fetched `alamaticzData` but — bug — never actually
 *     rendered it; the right panel only ever branched on `isPdf`, so the
 *     button silently did nothing visible beyond widening the modal.
 *   - UploadPage.jsx `CandidateDetailsModal` (~line 1515) — delete but no
 *     status toggle, and a working "View Alamaticz Format" toggle that
 *     rendered the fetched data as raw `dangerouslySetInnerHTML`
 *     (`formatted_html`) or a raw JSON dump as a fallback, with no
 *     template choice and no edit capability. Does not use the shared
 *     `ResumePreview` component.
 *
 * Prop-driven reconciliation:
 *   - `onToggleStatus` (optional): presence enables the JobsPage-style
 *     "Select Candidate / Selected" button, and makes the formatted-resume
 *     panel auto-show once the candidate's status is 'selected' (matching
 *     JobsPage exactly). Absence falls back to the Dashboard/Upload-style
 *     "View/Hide Alamaticz Format" header toggle button.
 *   - `onDeleteCandidate` (optional): presence enables the "Delete
 *     Candidate" button (JobsPage, UploadPage had this; DashboardPage
 *     did not).
 *   - `editable` (optional, default `Boolean(onToggleStatus)`): whether the
 *     formatted-resume panel offers Edit/Save/Cancel via `ResumeEditor`.
 *     Defaults to on for the JobsPage-style flow (its original behavior)
 *     and off for the toggle-driven flow (Dashboard/Upload never supported
 *     editing).
 *   - `showExportDocx` (optional, default `Boolean(onToggleStatus)`):
 *     whether the "Alamaticz Format" DOCX-download button appears in the
 *     header (JobsPage-only originally).
 *   - `showFormattedToggle` (optional, default `!onToggleStatus`): whether
 *     the "View/Hide Alamaticz Format" toggle button appears.
 *   - `defaultResumeTemplate` (optional, default `'alamaticz'`): initial
 *     template id for the formatted-resume preview/export.
 *
 * Bug fixes made while merging:
 *   - JobsPage's original referenced `resumeTemplate` / `setResumeTemplate`
 *     as if they were in scope, but those were actually `useState` in the
 *     *page* component (`JobsPage`), declared in a completely separate,
 *     later-defined function — an unbound-identifier `ReferenceError`
 *     waiting to happen the moment the formatted panel rendered. This
 *     component now owns that state itself (seeded from
 *     `defaultResumeTemplate`), which is both correct and a more sensible
 *     place for it to live.
 *   - The formatted-resume panel is always rendered through the shared
 *     `ResumePreview` component (view) and `ResumeEditor` (edit), instead
 *     of DashboardPage's dead code or UploadPage's raw-HTML/JSON dump —
 *     giving all three call sites the same, more complete viewer.
 */
export default function CandidateDetailsModal({
    candidate,
    onClose,
    onViewPdf,
    onToggleStatus,
    onDeleteCandidate,
    editable,
    showExportDocx,
    showFormattedToggle,
    defaultResumeTemplate = 'alamaticz',
}) {
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast();
    const modalRef = useModalA11y(true, onClose);
    const canEdit = editable !== undefined ? editable : Boolean(onToggleStatus);
    const canExportDocx = showExportDocx !== undefined ? showExportDocx : Boolean(onToggleStatus);
    const canToggleFormatted = showFormattedToggle !== undefined ? showFormattedToggle : !onToggleStatus;

    const [activeTab, setActiveTab] = useState('profile');
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [jobStatus, setJobStatus] = useState(candidate?.job_status || '');
    const [showAlamaticz, setShowAlamaticz] = useState(false);
    const [resumeTemplate, setResumeTemplate] = useState(defaultResumeTemplate);

    const [formattedData, setFormattedData] = useState(null);
    const [loadingFormatted, setLoadingFormatted] = useState(false);
    const [isEditingFormatted, setIsEditingFormatted] = useState(false);
    const [editedFormState, setEditedFormState] = useState(null);
    const [savingEdited, setSavingEdited] = useState(false);

    // Whether the formatted-resume panel should be showing right now.
    const showFormattedPanel = onToggleStatus ? jobStatus === 'selected' : showAlamaticz;

    useEffect(() => {
        setIsEditingFormatted(false);
        setEditedFormState(null);
    }, [candidate, jobStatus]);

    useEffect(() => {
        if (candidate?.id) {
            setLoadingJobs(true);
            apiClient.get(`/api/candidates/${candidate.id}/jobs`)
                .then(res => setJobs(res.data || []))
                .catch(err => console.error("Failed to load candidate matched jobs", err))
                .finally(() => setLoadingJobs(false));
        }
    }, [candidate]);

    // JobsPage-style flow: auto-load the formatted resume once selected.
    useEffect(() => {
        if (onToggleStatus && candidate?.id && jobStatus === 'selected') {
            setFormattedData(null);
            setLoadingFormatted(true);
            apiClient.get(`/api/candidates/${candidate.id}/formatted-resume`)
                .then(res => setFormattedData(res.data))
                .catch(err => console.error("Failed to load formatted resume", err))
                .finally(() => setLoadingFormatted(false));
        }
    }, [candidate, jobStatus, onToggleStatus]);

    // Dashboard/Upload-style flow: fetch on demand when the toggle is switched on.
    const handleToggleFormatted = async () => {
        if (showAlamaticz) {
            setShowAlamaticz(false);
            return;
        }
        setShowAlamaticz(true);
        if (!formattedData) {
            setLoadingFormatted(true);
            try {
                const res = await apiClient.get(`/api/candidates/${candidate.id}/formatted-resume`);
                setFormattedData(res.data);
            } catch (err) {
                console.error("Failed to load Alamaticz format data", err);
                showToast("Failed to load Alamaticz format data", "error");
                setShowAlamaticz(false);
            } finally {
                setLoadingFormatted(false);
            }
        }
    };

    const handleStartEditing = () => {
        setEditedFormState(JSON.parse(JSON.stringify(formattedData || {})));
        setIsEditingFormatted(true);
    };

    const handleSaveEditedResume = async () => {
        if (!editedFormState) return;
        setSavingEdited(true);
        try {
            const res = await apiClient.put(`/api/candidates/${candidate.id}/formatted-resume`, editedFormState);
            if (res.data.status === 'updated') {
                setFormattedData(editedFormState);
                setIsEditingFormatted(false);
            }
        } catch (err) {
            console.error("Failed to save formatted resume", err);
            showToast("Failed to save edited resume: " + (err.response?.data?.detail || err.message), "error");
        } finally {
            setSavingEdited(false);
        }
    };

    const handlePrintResume = () => {
        if (!formattedData) return;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(getResumeHtml(formattedData, candidate, alamaticzLogo, resumeTemplate));
            printWindow.document.close();
        } else {
            showToast('Please allow popups to print/export PDF.', 'error');
        }
    };

    const handleDownloadDocx = async () => {
        try {
            const res = await apiClient.get(`/api/candidates/${candidate.id}/export-docx`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Alamaticz_Resume_${(candidate.full_name || 'Candidate').replace(/ /g, '_')}.docx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            showToast('Failed to download Alamaticz resume.', 'error');
        }
    };

    const handleToggleStatusClick = async () => {
        const nextStatus = jobStatus === 'selected' ? 'matched' : 'selected';
        try {
            await onToggleStatus(candidate.id, nextStatus);
            setJobStatus(nextStatus);
            // Also update local copy in object
            candidate.job_status = nextStatus;
        } catch (err) {
            console.error("Failed to toggle status", err);
        }
    };

    const isImmediate = (val) => {
        if (val === 0 || val === '0') return true;
        return String(val || '').toLowerCase().includes('immediate');
    };

    const isPdf = candidate.filename && candidate.filename.toLowerCase().endsWith('.pdf');

    const hasViewableResume = candidate.filename &&
        !candidate.filename.toLowerCase().endsWith('.xlsx') &&
        !candidate.filename.toLowerCase().endsWith('.xls') &&
        !candidate.filename.toLowerCase().endsWith('.csv');

    const showRightPanel = hasViewableResume || showFormattedPanel;

    return (
        <div className="modal-overlay" style={{ zIndex: 99998 }} onClick={onClose}>
            <div ref={modalRef} className="card" role="dialog" aria-modal="true" aria-label={`Candidate details: ${candidate?.full_name || 'candidate'}`} onClick={e => e.stopPropagation()} style={{
                width: '95%',
                maxWidth: showRightPanel ? '1400px' : '800px',
                height: showRightPanel ? '90vh' : 'auto',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'row',
                padding: 0,
                overflow: 'hidden'
            }}>
                {/* Left Panel: Candidate details */}
                <div style={{
                    flex: showRightPanel ? '1 1 50%' : '1 1 100%',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    overflow: 'hidden',
                    borderRight: showRightPanel ? '1px solid var(--border)' : 'none'
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                        borderBottom: '1px solid var(--border)'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.25rem', fontWeight: 800 }}>
                                {candidate.full_name || 'Candidate Details'}
                            </h3>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', gap: '15px' }}>
                                <span>Source: <strong style={{ color: 'var(--gold)' }}>{candidate.source || 'Resume Upload'}</strong></span>
                                {candidate.timestamp && <span>Analyzed: {formatDate(candidate.timestamp)}</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {canExportDocx && (
                                <button
                                    onClick={handleDownloadDocx}
                                    style={{
                                        background: 'var(--gold)', border: 'none',
                                        color: 'var(--action-fg)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                        fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        boxShadow: '0 4px 10px rgba(var(--gold-rgb), 0.2)'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                                >
                                    <Download size={14} /> Alamaticz Format
                                </button>
                            )}
                            {canToggleFormatted && (
                                <button
                                    onClick={handleToggleFormatted}
                                    style={{
                                        background: showAlamaticz ? 'rgba(var(--gold-rgb), 0.2)' : 'var(--gold)', border: showAlamaticz ? '1px solid var(--gold)' : 'none',
                                        color: showAlamaticz ? 'var(--gold)' : 'var(--action-fg)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                        fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        boxShadow: showAlamaticz ? 'none' : '0 4px 10px rgba(var(--gold-rgb), 0.2)'
                                    }}
                                >
                                    <Eye size={14} /> {showAlamaticz ? 'Hide Alamaticz Format' : 'View Alamaticz Format'}
                                </button>
                            )}
                            {onToggleStatus && jobStatus && (
                                <button
                                    onClick={handleToggleStatusClick}
                                    style={{
                                        background: jobStatus === 'selected' ? 'var(--success-bg)' : 'rgba(var(--gold-rgb), 0.15)',
                                        border: jobStatus === 'selected' ? '1px solid rgba(var(--green-rgb), 0.35)' : '1px solid rgba(var(--gold-rgb), 0.35)',
                                        color: jobStatus === 'selected' ? 'var(--success-fg)' : 'var(--gold)',
                                        cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                        fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                >
                                    {jobStatus === 'selected' ? <><Check size={14} /> Selected for Job</> : <><Plus size={14} /> Select Candidate</>}
                                </button>
                            )}
                            {onDeleteCandidate && (
                                <button
                                    onClick={() => onDeleteCandidate(candidate.id)}
                                    style={{
                                        background: 'var(--danger-bg)', border: '1px solid rgba(var(--red-rgb), 0.3)',
                                        color: 'var(--danger-fg)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                        fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--red-rgb), 0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--danger-bg)'}
                                >
                                    <Trash2 size={14} /> Delete Candidate
                                </button>
                            )}
                            {candidate.filename && !candidate.filename.toLowerCase().endsWith('.xlsx') && !candidate.filename.toLowerCase().endsWith('.xls') && !candidate.filename.toLowerCase().endsWith('.csv') && (
                                isPdf ? (
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
                                        <FileText size={14} /> Open in New Tab
                                    </button>
                                ) : (
                                    <a
                                        href={getStaticUrl(candidate.filename)}
                                        download={candidate.filename}
                                        style={{
                                            background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                            color: 'var(--sky-dim)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                            fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                            textDecoration: 'none'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.25)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.15)'}
                                    >
                                        <Download size={14} /> Download Resume
                                    </a>
                                )
                            )}
                            <button onClick={onClose} aria-label="Close" style={{
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

                                {candidate.email_message && (
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>✉️ Imported Email Message</span>
                                        <div style={{
                                            padding: '12px',
                                            background: 'rgba(var(--navy-dark-rgb), 0.5)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            fontSize: '0.84rem',
                                            whiteSpace: 'pre-wrap',
                                            lineHeight: '1.45',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            color: 'var(--text)',
                                            fontFamily: 'monospace'
                                        }}>
                                            {candidate.email_message}
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
                                                                                    background: isSelected ? 'var(--success-bg)' : 'var(--info-bg)',
                                                                    color: isSelected ? 'var(--success-fg)' : 'var(--info-fg)',
                                                                    border: isSelected ? '1px solid rgba(var(--green-rgb), 0.25)' : '1px solid rgba(var(--sky-rgb), 0.25)',
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

                {/* Right Panel: Resume PDF embedded directly, formatted resume, or download placeholder */}
                {showRightPanel && (
                    <div style={{
                        flex: '1 1 50%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        background: showFormattedPanel ? 'var(--surface-sunken)' : (isPdf ? 'var(--surface-sunken)' : 'var(--navy-dark)'),
                        justifyContent: (showFormattedPanel || isPdf) ? 'stretch' : 'center',
                        alignItems: (showFormattedPanel || isPdf) ? 'stretch' : 'center',
                        padding: (showFormattedPanel || isPdf) ? 0 : '40px',
                        borderLeft: '1px solid var(--border)',
                        overflow: 'hidden'
                    }}>
                        {showFormattedPanel ? (
                            <>
                                {/* Action Bar */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 16px',
                                    background: 'var(--navy-dark)',
                                    borderBottom: '1px solid var(--border)',
                                    flexShrink: 0
                                }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                                        {isEditingFormatted ? '✏️ Edit Alamaticz Resume' : '📄 Company Formatted Resume'}
                                    </span>
                                    {!isEditingFormatted && (
                                        <div style={{ display: 'flex', gap: '8px', marginRight: 'auto', marginLeft: '20px' }}>
                                            <button onClick={() => setResumeTemplate('alamaticz')} style={{ background: resumeTemplate === 'alamaticz' ? 'var(--gold)' : 'transparent', color: resumeTemplate === 'alamaticz' ? 'var(--action-fg)' : 'var(--gold)', border: '1px solid var(--gold)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Alamaticz</button>
                                            <button onClick={() => setResumeTemplate('modern')} style={{ background: resumeTemplate === 'modern' ? 'var(--gold)' : 'transparent', color: resumeTemplate === 'modern' ? 'var(--action-fg)' : 'var(--gold)', border: '1px solid var(--gold)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Modern</button>
                                            <button onClick={() => setResumeTemplate('classic')} style={{ background: resumeTemplate === 'classic' ? 'var(--gold)' : 'transparent', color: resumeTemplate === 'classic' ? 'var(--action-fg)' : 'var(--gold)', border: '1px solid var(--gold)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Classic</button>
                                        </div>
                                    )}
                                    {isEditingFormatted ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={handleSaveEditedResume}
                                                disabled={savingEdited}
                                                style={{
                                                    background: 'var(--success-fg)',
                                                    color: 'var(--surface)',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    padding: '6px 14px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    cursor: savingEdited ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    opacity: savingEdited ? 0.6 : 1
                                                }}
                                            >
                                                {savingEdited ? <Loader className="spin" size={14} /> : <Check size={14} />} Save
                                            </button>
                                            <button
                                                onClick={() => setIsEditingFormatted(false)}
                                                disabled={savingEdited}
                                                style={{
                                                    background: 'var(--danger-bg)',
                                                    color: 'var(--danger-fg)',
                                                    border: '1px solid rgba(var(--red-rgb), 0.3)',
                                                    borderRadius: '6px',
                                                    padding: '6px 14px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    cursor: savingEdited ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <X size={14} /> Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {canEdit && (
                                                <button
                                                    onClick={handleStartEditing}
                                                    disabled={loadingFormatted || !formattedData}
                                                    style={{
                                                        background: 'rgba(var(--gold-rgb), 0.15)',
                                                        color: 'var(--gold)',
                                                        border: '1px solid rgba(var(--gold-rgb), 0.35)',
                                                        borderRadius: '6px',
                                                        padding: '6px 14px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        cursor: (loadingFormatted || !formattedData) ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        opacity: (loadingFormatted || !formattedData) ? 0.6 : 1
                                                    }}
                                                >
                                                    <Edit size={14} /> Edit
                                                </button>
                                            )}
                                            <button
                                                onClick={handlePrintResume}
                                                disabled={loadingFormatted || !formattedData}
                                                style={{
                                                    background: 'var(--gold)',
                                                    color: 'var(--action-fg)',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    padding: '6px 14px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    cursor: (loadingFormatted || !formattedData) ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    opacity: (loadingFormatted || !formattedData) ? 0.6 : 1
                                                }}
                                            >
                                                <Download size={14} /> Export PDF
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {loadingFormatted ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-dim)', gap: '12px' }}>
                                        <Loader className="spin" size={28} style={{ color: 'var(--gold)' }} />
                                        <span style={{ fontSize: '0.85rem' }}>Generating formatted resume...</span>
                                    </div>
                                ) : isEditingFormatted ? (
                                    <ResumeEditor formData={editedFormState} setFormData={setEditedFormState} />
                                ) : formattedData ? (
                                    <ResumePreview data={formattedData} logoUrl={alamaticzLogo} templateId={resumeTemplate} />
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-dim)' }}>
                                        Failed to load Alamaticz Format.
                                    </div>
                                )}
                            </>
                        ) : (
                            isPdf ? (
                                <iframe
                                    src={`${getStaticUrl(candidate.filename)}#view=FitH`}
                                    style={{ width: '100%', height: '100%', border: 'none', background: 'var(--surface-sunken)' }}
                                    title="Candidate Resume"
                                />
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '20px',
                                    color: 'var(--text)',
                                    maxWidth: '400px',
                                    margin: '0 auto'
                                }}>
                                    <div style={{
                                        width: '80px',
                                        height: '80px',
                                        borderRadius: '50%',
                                        background: 'rgba(var(--gold-rgb), 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(var(--gold-rgb), 0.25)',
                                        marginBottom: '10px'
                                    }}>
                                        <FileText size={40} color="var(--gold)" />
                                    </div>
                                    <h4 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.2rem', fontWeight: 700 }}>
                                        Word Document (.docx/.doc)
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                                        Preview is not supported directly in the browser. Please download the file to view the candidate's resume.
                                    </p>
                                    <a
                                        href={getStaticUrl(candidate.filename)}
                                        download={candidate.filename}
                                        style={{
                                            background: 'var(--gold)',
                                            color: 'var(--action-fg)',
                                            textDecoration: 'none',
                                            fontSize: '0.85rem',
                                            fontFamily: 'var(--fh)',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: '10px 24px',
                                            borderRadius: '8px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 4px 12px rgba(var(--gold-rgb), 0.2)'
                                        }}
                                    >
                                        <Download size={16} /> Download Resume
                                    </a>
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
            <div onClick={e => e.stopPropagation()}>
                <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            </div>
        </div>
    );
}
