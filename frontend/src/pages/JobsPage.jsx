import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Briefcase, Plus, Trash2, Search, UserCheck, Loader, ChevronRight, Edit, Calendar, User, Building, DollarSign, Award, Target } from 'lucide-react';
const API_URL = import.meta.env.VITE_API_URL || '';

export default function JobsPage() {
    const [jobs, setJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newJob, setNewJob] = useState({
        title: '',
        description: '',
        client_name: '',
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

    const [editingJob, setEditingJob] = useState(null);
    const [editJobForm, setEditJobForm] = useState({
        title: '',
        description: '',
        client_name: '',
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

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

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

    useEffect(() => {
        loadJobs();
    }, []);

    useEffect(() => {
        if (selectedJob) loadCandidates(selectedJob.id);
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

    const handleStatusChange = async (candidateId, newStatus) => {
        try {
            await axios.put(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${candidateId}`, { status: newStatus });
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

    const filteredCandidates = candidates.filter(c => c.job_status === activeTab);

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left Sidebar: Job List */}
            <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--fh)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold)' }}>
                        Job Descriptions
                    </div>
                    <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => setShowNewForm(true)}>
                        <Plus size={16} /> New Job Description
                    </button>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {jobs.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem' }}>
                            No Job Descriptions yet.<br/>Click "New Job Description" to add one.
                        </div>
                    )}
                    {jobs.map(job => (
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
                            <div style={{ fontWeight: 700, color: selectedJob?.id === job.id ? 'var(--gold)' : 'var(--text)', marginBottom: '6px' }}>
                                {job.title}
                            </div>
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
                                        Client: <strong style={{ color: '#fff' }}>{selectedJob.client_name || 'N/A'}</strong>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn btn-secondary" onClick={() => {
                                        setEditingJob(selectedJob);
                                        setEditJobForm({
                                            title: selectedJob.title || '',
                                            description: selectedJob.description || '',
                                            client_name: selectedJob.client_name || '',
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
                                    }} style={{ borderColor: 'rgba(var(--gold-rgb), 0.3)', color: 'var(--gold)' }}>
                                        <Edit size={16}/> Edit Job
                                    </button>
                                    <button className="btn btn-danger" onClick={() => handleDeleteJob(selectedJob.id)}>
                                        <Trash2 size={16}/> Delete Job Description
                                    </button>
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
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Contact Name</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.contact_name || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Account Manager</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.account_manager || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Assigned Recruiter</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <User size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.assigned_recruiter || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Target Date</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Calendar size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.target_date || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Work Experience</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Award size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.work_experience || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Industry</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Briefcase size={14} style={{ color: 'var(--gold)' }} /> {selectedJob.industry || '--'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '2px' }}>Salary</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
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

                            {/* Job Description Text Area (Collapsible) */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Full Job Description</span>
                                <div style={{ 
                                    color: 'var(--text)', 
                                    fontSize: '0.9rem', 
                                    maxHeight: '120px', 
                                    overflowY: 'auto',
                                    padding: '12px',
                                    background: 'rgba(var(--navy-dark-rgb), 0.2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {selectedJob.description}
                                </div>
                            </div>
                            
                            <button 
                                className="btn btn-primary" 
                                onClick={handleMatch}
                                disabled={isMatching}
                                style={{ width: 'fit-content' }}
                            >
                                {isMatching ? <Loader className="spin" size={16} /> : <Search size={16} />}
                                {isMatching ? 'Finding Perfect Matches...' : 'Match Job Description'}
                            </button>
                        </div>
 
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
 
                        {/* Candidates List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                            {filteredCandidates.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem' }}>
                                    {activeTab === 'matched' ? 'No candidates matched yet. Click "Match Job Description" to find perfect matches in your database.' : 'No candidates selected yet. Select them from the Matched tab.'}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {filteredCandidates.map(c => (
                                        <div key={c.id} className="card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <h3 style={{ margin: '0 0 8px 0', color: 'var(--sky)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {c.full_name || c.filename}
                                                    {c.is_qualified ? <span style={{fontSize: '0.8rem', background: 'rgba(var(--gold-rgb), 0.2)', padding: '2px 8px', borderRadius: '12px', color: 'var(--gold)'}}>⭐ Qualified</span> : null}
                                                </h3>
                                                <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: 'var(--text)', marginBottom: '10px', flexWrap: 'wrap' }}>
                                                    <span><strong>Exp:</strong> {c.total_experience || 0} yrs</span>
                                                    <span><strong>Skills:</strong> {c.skills || 'N/A'}</span>
                                                    {c.current_location && <span><strong>Current Location:</strong> {c.current_location}</span>}
                                                    {c.pref_locations && <span><strong>Pref Locations:</strong> {c.pref_locations}</span>}
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', borderLeft: '3px solid var(--gold)' }}>
                                                    <strong>🤖 AI Analysis:</strong> {c.ai_reason}
                                                </div>
                                            </div>
                                            <div style={{ marginLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
                                                {activeTab === 'matched' ? (
                                                    <button className="btn btn-primary" onClick={() => handleStatusChange(c.id, 'selected')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                                        Select for Job <ChevronRight size={14}/>
                                                    </button>
                                                ) : (
                                                    <button className="btn btn-secondary" onClick={() => handleStatusChange(c.id, 'matched')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                                        Remove Selection
                                                    </button>
                                                )}
                                                <button className="btn btn-secondary" onClick={() => {
                                                    setEditingCandidate(c);
                                                    setEditName(c.full_name || c.filename || '');
                                                    setEditExp(c.total_experience || '0');
                                                    setEditSkills(c.skills || '');
                                                    setEditReason(c.ai_reason || '');
                                                    setEditCurrentLocation(c.current_location || '');
                                                    setEditPrefLocations(c.pref_locations || '');
                                                }} style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', borderColor: 'rgba(var(--gold-rgb), 0.3)', color: 'var(--gold)' }}>
                                                    <Edit size={12}/> Edit Details
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => handleRemoveFromJob(c.id)} style={{ fontSize: '0.8rem', padding: '6px 12px', borderColor: 'rgba(var(--sky-rgb), 0.3)', color: 'var(--sky)' }}>
                                                    Remove from Job
                                                </button>
                                                <button className="btn btn-danger" onClick={() => handleDeleteCandidate(c.id)} style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                    <Trash2 size={12}/> Delete Candidate
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <Briefcase size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                            <h3>Select a Job Description</h3>
                            <p>Or create a new one to get started</p>
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

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.msg}</div>
                </div>
            )}
        </div>
    );
}
