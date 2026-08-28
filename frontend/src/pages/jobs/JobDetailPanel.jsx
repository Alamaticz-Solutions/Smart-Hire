import React from 'react';
import { ArrowLeft, Share2, MoreVertical, Edit, Trash2, Phone, User, Calendar, Award, Briefcase, DollarSign, Search, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import apiClient from '../../api/client';
import JobStatusChip from '../../components/shared/JobStatusChip';

// Extracted from JobsPage.jsx: the selectedJob header section — back button,
// job actions dropdown, status/type badges, parameter grid, required-skills
// badges, and the inline (double-click to edit) job description viewer/editor.
// Purely presentational; all state/handlers are owned by JobsPage and passed
// in as props. The JD-save inline handler below was already an anonymous
// arrow function defined directly in JobsPage's JSX (not a named handler in
// JobsPage), so it's kept here as-is, driven off the setJobs/setSelectedJob/
// showToast/loadCandidates props passed down.
export default function JobDetailPanel({
    selectedJob,
    setSelectedJob,
    isExternal,
    isAdmin,
    showDropdown,
    setShowDropdown,
    handleOpenShareModal,
    handleStartEditJob,
    handleDeleteJob,
    isEditingJdInline,
    setIsEditingJdInline,
    jdInlineValue,
    setJdInlineValue,
    jobs,
    setJobs,
    showToast,
    loadCandidates,
    handleMatch,
    isMatching,
    setViewingSharedList,
}) {
    return (
        <div style={{ padding: '2rem', borderBottom: '1px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => setSelectedJob(null)}
                    >
                        <ArrowLeft size={14} /> Back to Jobs
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', margin: 0 }}>{selectedJob.title}</h2>

                        {/* Status Badge */}
                        <JobStatusChip status={selectedJob.job_status} size="md" />

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
                    {!isExternal && selectedJob.shared_with && selectedJob.shared_with.length > 0 && (
                        <div
                            onClick={() => setViewingSharedList(selectedJob)}
                            style={{
                                fontSize: '0.82rem',
                                color: 'var(--gold)',
                                marginTop: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(var(--gold-rgb), 0.1)',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(var(--gold-rgb), 0.2)',
                                width: 'fit-content',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                            title="Click to view shared users"
                        >
                            <Share2 size={13} /> Shared with {selectedJob.shared_with.length} {selectedJob.shared_with.length === 1 ? 'user' : 'users'}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {isAdmin && (
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
                                            handleStartEditJob(selectedJob);
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
                                            color: 'var(--danger-fg)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
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
            <div className="jd-param-grid">
                <div className="jd-param-card">
                    <span className="jd-param-label">Client Phone</span>
                    <span className="jd-param-value">
                        <Phone size={14} className="jd-param-icon" /> {selectedJob.client_phone || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Contact Name</span>
                    <span className="jd-param-value">
                        <User size={14} className="jd-param-icon" /> {selectedJob.contact_name || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Account Manager</span>
                    <span className="jd-param-value">
                        <User size={14} className="jd-param-icon" /> {selectedJob.account_manager || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Assigned Recruiter</span>
                    <span className="jd-param-value">
                        <User size={14} className="jd-param-icon" /> {selectedJob.assigned_recruiter || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Target Date</span>
                    <span className="jd-param-value">
                        <Calendar size={14} className="jd-param-icon" /> {selectedJob.target_date || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Work Experience</span>
                    <span className="jd-param-value">
                        <Award size={14} className="jd-param-icon" /> {selectedJob.work_experience || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Industry</span>
                    <span className="jd-param-value">
                        <Briefcase size={14} className="jd-param-icon" /> {selectedJob.industry || '--'}
                    </span>
                </div>
                <div className="jd-param-card">
                    <span className="jd-param-label">Salary</span>
                    <span className="jd-param-value">
                        <DollarSign size={14} className="jd-param-icon" /> {selectedJob.salary || '--'}
                    </span>
                </div>
            </div>

            {/* Required Skills Badges */}
            {selectedJob.required_skills && (
                <div style={{ marginBottom: '1.75rem' }}>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04rem' }}>Required Skills</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {selectedJob.required_skills.split(',').map((skill, index) => {
                            const trimmed = skill.trim();
                            if (!trimmed) return null;
                            return (
                                <span key={index} className="jd-skill-pill">
                                    <Award size={12} /> {trimmed}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04rem' }}>
                    Full Job Description {isEditingJdInline ? '(Editing)' : (!isExternal ? '(Double-click text below to edit)' : '')}
                </span>
                {isEditingJdInline ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                            value={jdInlineValue}
                            onChange={e => setJdInlineValue(e.target.value)}
                            className="modern-textarea"
                            style={{ minHeight: '180px' }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                                onClick={() => setIsEditingJdInline(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
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
                                        const r = await apiClient.put(`/api/jobs/${selectedJob.id}`, updatedJobForm);
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
                        className="jd-markdown-container"
                        style={{
                            cursor: !isExternal ? 'pointer' : 'default'
                        }}
                    >
                        <ReactMarkdown>{selectedJob.description}</ReactMarkdown>
                    </div>
                )}
            </div>

            {!isExternal && (
                <div>
                    <button
                        className="btn btn-primary"
                        onClick={handleMatch}
                        disabled={isMatching}
                        style={{ width: 'fit-content' }}
                    >
                        {isMatching ? <Loader className="spin" size={16} /> : <Search size={16} />}
                        {isMatching ? 'Scoring candidates…' : 'Match Job Description'}
                    </button>
                    {/* S5.3: the action previously had no explanation of what it does,
                        how long it takes, or what "matched" means - and both its own
                        label and the empty state below overclaimed "perfect matches". */}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '6px', maxWidth: '480px' }}>
                        {isMatching
                            ? 'Scoring every candidate in your database against this job’s requirements - usually well under a minute.'
                            : 'Scores every candidate in your database against this job’s requirements and adds the closest matches to the Matched tab.'}
                    </p>
                </div>
            )}
        </div>
    );
}
