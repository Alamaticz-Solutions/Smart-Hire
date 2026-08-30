import React from 'react';
import { Briefcase, Building, Phone, User, Calendar, Target, Award, DollarSign, UploadCloud, Loader } from 'lucide-react';

// Extracted from JobsPage.jsx: the "Create New Job Description" form shown
// when showNewForm is true (JD upload dropzone that auto-fills the form + the
// full new-job field grid). Not part of the original suggested split list
// (JobSidebar/JobDetailPanel/CandidatesTable/JobsOverview/modals) because it's
// a genuinely distinct section — its own JSX branch guarded by showNewForm,
// operating on `newJob` state rather than `selectedJob`. Purely presentational;
// all state/handlers still live in JobsPage.
export default function NewJobForm({
    newJob,
    setNewJob,
    getJdRootProps,
    getJdInputProps,
    isJdDragActive,
    isParsingJD,
    setShowNewForm,
    handleCreateJob,
    isCreatingJob,
}) {
    return (
        <div style={{ padding: '2rem 3rem', maxWidth: '900px', margin: '0 auto', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card card--spacious">
                <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', marginBottom: '2rem', fontSize: '1.75rem', fontWeight: 800 }}>Create New Job Description</h2>

                {/* JD Document Upload Zone */}
                <div style={{ marginBottom: '2rem' }}>
                    <label className="form-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--sky-dim)' }}>
                        Optionally Upload JD Document to Auto-Fill Form
                    </label>
                    <div
                        {...getJdRootProps()}
                        style={{
                            border: `2px dashed ${isJdDragActive ? 'var(--gold)' : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '2rem',
                            textAlign: 'center',
                            background: isJdDragActive ? 'rgba(var(--gold-rgb), 0.1)' : 'rgba(var(--navy-rgb), 0.2)',
                            cursor: isParsingJD ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            position: 'relative'
                        }}
                    >
                        <input {...getJdInputProps()} disabled={isParsingJD} />
                        {isParsingJD ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                <Loader size={36} className="spin" style={{ color: 'var(--gold)' }} />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>
                                    AI is extracting job details... Please wait...
                                </span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                <UploadCloud size={36} style={{ color: 'var(--sky)' }} />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                                    {isJdDragActive ? (
                                        <strong>Drop the JD document here...</strong>
                                    ) : (
                                        <>
                                            <strong>Drag & drop JD file (PDF or Word)</strong> here, or click to browse
                                        </>
                                    )}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', opacity: 0.7 }}>
                                    Supported formats: PDF, DOCX, DOC
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-section-title">
                    <Briefcase size={18} /> Role & Client Details
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label className="form-label">Job Title *</label>
                        <div className="form-input-group">
                            <Briefcase size={16} className="form-input-icon" />
                            <input value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. Pega CSSA" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Client Name</label>
                        <div className="form-input-group">
                            <Building size={16} className="form-input-icon" />
                            <input value={newJob.client_name} onChange={e => setNewJob({...newJob, client_name: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. My company" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Client Phone</label>
                        <div className="form-input-group">
                            <Phone size={16} className="form-input-icon" />
                            <input value={newJob.client_phone} onChange={e => setNewJob({...newJob, client_phone: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. +1 555-0199" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Contact Name</label>
                        <div className="form-input-group">
                            <User size={16} className="form-input-icon" />
                            <input value={newJob.contact_name} onChange={e => setNewJob({...newJob, contact_name: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. Sabari Shree" />
                        </div>
                    </div>
                </div>

                <div className="form-section-title">
                    <User size={18} /> Management & Timeline
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label className="form-label">Account Manager</label>
                        <div className="form-input-group">
                            <User size={16} className="form-input-icon" />
                            <input value={newJob.account_manager} onChange={e => setNewJob({...newJob, account_manager: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. Sabari Shree" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Assigned Recruiter(s)</label>
                        <div className="form-input-group">
                            <User size={16} className="form-input-icon" />
                            <input value={newJob.assigned_recruiter} onChange={e => setNewJob({...newJob, assigned_recruiter: e.target.value})} className="form-input form-input--icon-inset" placeholder="Recruiter Name" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Target Date</label>
                        <div className="form-input-group">
                            <Calendar size={16} className="form-input-icon" />
                            <input type="date" value={newJob.target_date} onChange={e => setNewJob({...newJob, target_date: e.target.value})} className="form-input form-input--icon-inset" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Job Type</label>
                        <div className="form-input-group">
                            <Briefcase size={16} className="form-input-icon" />
                            <select value={newJob.job_type} onChange={e => setNewJob({...newJob, job_type: e.target.value})} className="form-input form-input--icon-inset">
                                <option value="Full time">Full time</option>
                                <option value="Part time">Part time</option>
                                <option value="Contract">Contract</option>
                                <option value="Temporary">Temporary</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="form-section-title">
                    <Target size={18} /> Requirements & Salary
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label className="form-label">Job Opening Status</label>
                        <div className="form-input-group">
                            <Target size={16} className="form-input-icon" />
                            <select value={newJob.job_status} onChange={e => setNewJob({...newJob, job_status: e.target.value})} className="form-input form-input--icon-inset">
                                <option value="In-progress">In-progress</option>
                                <option value="On-hold">On-hold</option>
                                <option value="Filled">Filled</option>
                                <option value="Closed">Closed</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Work Experience</label>
                        <div className="form-input-group">
                            <Award size={16} className="form-input-icon" />
                            <select value={newJob.work_experience} onChange={e => setNewJob({...newJob, work_experience: e.target.value})} className="form-input form-input--icon-inset">
                                <option value="None">None</option>
                                <option value="Fresher">Fresher</option>
                                <option value="1-3 years">1-3 years</option>
                                <option value="3-5 years">3-5 years</option>
                                <option value="5+ years">5+ years</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Industry</label>
                        <div className="form-input-group">
                            <Building size={16} className="form-input-icon" />
                            <select value={newJob.industry} onChange={e => setNewJob({...newJob, industry: e.target.value})} className="form-input form-input--icon-inset">
                                <option value="None">None</option>
                                <option value="IT">IT</option>
                                <option value="Finance">Finance</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Telecom">Telecom</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="form-label">Salary</label>
                        <div className="form-input-group">
                            <DollarSign size={16} className="form-input-icon" />
                            <input value={newJob.salary} onChange={e => setNewJob({...newJob, salary: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. 10 LPA" />
                        </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Required Skills</label>
                        <div className="form-input-group">
                            <Award size={16} className="form-input-icon" />
                            <input value={newJob.required_skills} onChange={e => setNewJob({...newJob, required_skills: e.target.value})} className="form-input form-input--icon-inset" placeholder="e.g. Pega, CSSA" />
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <label className="form-label">Job Description *</label>
                    <textarea
                        value={newJob.description}
                        onChange={e => setNewJob({...newJob, description: e.target.value})}
                        className="form-input form-input--textarea"
                        style={{ minHeight: '140px' }}
                        placeholder="Paste the full job description here..."
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '10px 22px', fontSize: '0.85rem' }} onClick={() => setShowNewForm(false)} disabled={isCreatingJob}>Cancel</button>
                    <button className="btn btn-primary" style={{ padding: '10px 22px', fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.3)' }} onClick={handleCreateJob} disabled={isCreatingJob}>
                        {isCreatingJob ? 'Creating...' : 'Create Job Description'}
                    </button>
                </div>
            </div>
        </div>
    );
}
