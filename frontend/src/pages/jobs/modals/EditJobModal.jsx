import React from 'react';
import { Briefcase, Building, Phone, User, Calendar, Target, Award, DollarSign } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';

// Extracted from JobsPage.jsx: the "Edit Job Description" modal (editingJob
// state). Purely presentational; all state/handlers are owned by JobsPage.
export default function EditJobModal({
    editingJob,
    setEditingJob,
    editJobForm,
    setEditJobForm,
    handleSaveJobEdit,
    isSavingJob,
}) {
    const modalRef = useModalA11y(!!editingJob, () => setEditingJob(null));
    if (!editingJob) return null;

    return (
        <div className="modal-overlay">
            <div ref={modalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="edit-job-modal-title" style={{ width: '850px', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 id="edit-job-modal-title" style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--fh)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', fontSize: '1.5rem', fontWeight: 800 }}>Edit Job Description</h3>

                <div className="form-section-title">
                    <Briefcase size={16} className="jd-param-icon" /> Role & Client Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div>
                        <label className="modern-label">Job Title *</label>
                        <div className="modern-input-group">
                            <Briefcase size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.title}
                                onChange={e => setEditJobForm({...editJobForm, title: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Client Name</label>
                        <div className="modern-input-group">
                            <Building size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.client_name}
                                onChange={e => setEditJobForm({...editJobForm, client_name: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Client Phone</label>
                        <div className="modern-input-group">
                            <Phone size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.client_phone}
                                onChange={e => setEditJobForm({...editJobForm, client_phone: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Contact Name</label>
                        <div className="modern-input-group">
                            <User size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.contact_name}
                                onChange={e => setEditJobForm({...editJobForm, contact_name: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>
                </div>

                <div className="form-section-title">
                    <User size={16} className="jd-param-icon" /> Management & Timeline
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div>
                        <label className="modern-label">Account Manager</label>
                        <div className="modern-input-group">
                            <User size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.account_manager}
                                onChange={e => setEditJobForm({...editJobForm, account_manager: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Assigned Recruiter(s)</label>
                        <div className="modern-input-group">
                            <User size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.assigned_recruiter}
                                onChange={e => setEditJobForm({...editJobForm, assigned_recruiter: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Target Date</label>
                        <div className="modern-input-group">
                            <Calendar size={16} className="modern-input-icon" />
                            <input
                                type="date"
                                value={editJobForm.target_date}
                                onChange={e => setEditJobForm({...editJobForm, target_date: e.target.value})}
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Job Type</label>
                        <div className="modern-input-group">
                            <Briefcase size={16} className="modern-input-icon" />
                            <select
                                value={editJobForm.job_type}
                                onChange={e => setEditJobForm({...editJobForm, job_type: e.target.value})}
                                className="modern-select"
                            >
                                <option value="Full time">Full time</option>
                                <option value="Part time">Part time</option>
                                <option value="Contract">Contract</option>
                                <option value="Temporary">Temporary</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="form-section-title">
                    <Target size={16} className="jd-param-icon" /> Requirements & Salary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div>
                        <label className="modern-label">Job Opening Status</label>
                        <div className="modern-input-group">
                            <Target size={16} className="modern-input-icon" />
                            <select
                                value={editJobForm.job_status}
                                onChange={e => setEditJobForm({...editJobForm, job_status: e.target.value})}
                                className="modern-select"
                            >
                                <option value="In-progress">In-progress</option>
                                <option value="On-hold">On-hold</option>
                                <option value="Filled">Filled</option>
                                <option value="Closed">Closed</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Work Experience</label>
                        <div className="modern-input-group">
                            <Award size={16} className="modern-input-icon" />
                            <select
                                value={editJobForm.work_experience}
                                onChange={e => setEditJobForm({...editJobForm, work_experience: e.target.value})}
                                className="modern-select"
                            >
                                <option value="None">None</option>
                                <option value="Fresher">Fresher</option>
                                <option value="1-3 years">1-3 years</option>
                                <option value="3-5 years">3-5 years</option>
                                <option value="5+ years">5+ years</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="modern-label">Industry</label>
                        <div className="modern-input-group">
                            <Building size={16} className="modern-input-icon" />
                            <select
                                value={editJobForm.industry}
                                onChange={e => setEditJobForm({...editJobForm, industry: e.target.value})}
                                className="modern-select"
                            >
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
                        <label className="modern-label">Salary</label>
                        <div className="modern-input-group">
                            <DollarSign size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.salary}
                                onChange={e => setEditJobForm({...editJobForm, salary: e.target.value})}
                                placeholder="e.g. 10 LPA"
                                className="modern-input"
                            />
                        </div>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="modern-label">Required Skills</label>
                        <div className="modern-input-group">
                            <Award size={16} className="modern-input-icon" />
                            <input
                                type="text"
                                value={editJobForm.required_skills}
                                onChange={e => setEditJobForm({...editJobForm, required_skills: e.target.value})}
                                placeholder="e.g. Pega, CSSA"
                                className="modern-input"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="modern-label">Job Description *</label>
                    <textarea
                        value={editJobForm.description}
                        onChange={e => setEditJobForm({...editJobForm, description: e.target.value})}
                        className="modern-textarea"
                        style={{ minHeight: '140px' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '10px 22px', fontSize: '0.85rem' }} onClick={() => setEditingJob(null)}>Cancel</button>
                    <button className="btn btn-primary" style={{ padding: '10px 22px', fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.3)' }} onClick={handleSaveJobEdit} disabled={isSavingJob}>
                        {isSavingJob ? 'Saving & Re-matching...' : 'Save & Re-match'}
                    </button>
                </div>
            </div>
        </div>
    );
}
