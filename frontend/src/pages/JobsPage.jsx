import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import apiClient, { getStaticUrl } from '../api/client';
import useColumnConfig from '../hooks/useColumnConfig';
import useDraggableColumns from '../hooks/useDraggableColumns';
import { useToast } from '../hooks/useToast';
import { computeTableWidth } from '../utils/tableWidth';
import CandidateDetailsModal from '../components/shared/CandidateDetailsModal';
import CellTextModal from '../components/shared/CellTextModal';
import JobSidebar from './jobs/JobSidebar';
import NewJobForm from './jobs/NewJobForm';
import JobDetailPanel from './jobs/JobDetailPanel';
import CandidatesTable from './jobs/CandidatesTable';
import JobsOverview from './jobs/JobsOverview';
import AddCandidateModal from './jobs/modals/AddCandidateModal';
import EditCandidateModal from './jobs/modals/EditCandidateModal';
import EditJobModal from './jobs/modals/EditJobModal';
import ShareModal from './jobs/modals/ShareModal';

export default function JobsPage() {
    const { user } = useOutletContext();
    const isExternal = user?.is_external === 1;
    const isAdmin = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1;

    const [resumeTemplate, setResumeTemplate] = useState('alamaticz');

    useEffect(() => {
        if (user?.username) {
            apiClient.get(`/api/integrations`, { headers: { 'x-user-username': user.username } })
                .then(res => {
                    if (res.data && res.data.default_resume_template) {
                        setResumeTemplate(res.data.default_resume_template);
                    }
                })
                .catch(err => console.error('Error fetching default template', err));
        }
    }, [user?.username]);

    // NOTE: left as plain useState + manual sessionStorage read/write rather than
    // switching to useSessionCache. Per that hook's own doc comment, JobsPage's
    // `cached_job_candidates_${jobId}` cache isn't a simple "value changes ->
    // persist" cache: on selectedJob change it first synchronously "peeks" the
    // cache for the new job id to avoid an empty UI flash, then separately kicks
    // off loadCandidates(jobId) to fetch-and-overwrite — a two-step flow the hook
    // doesn't model. Swapping it in risked changing caching behavior in a way
    // this pass couldn't fully verify, so it's left exactly as it was.
    const [jobs, setJobs] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('cached_jobs')) || [];
        } catch { return []; }
    });
    const [selectedJob, setSelectedJob] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('cached_selected_job')) || null;
        } catch { return null; }
    });
    const [candidates, setCandidates] = useState(() => {
        try {
            const initialSelected = JSON.parse(sessionStorage.getItem('cached_selected_job'));
            if (initialSelected) {
                return JSON.parse(sessionStorage.getItem(`cached_job_candidates_${initialSelected.id}`)) || [];
            }
        } catch {}
        return [];
    });
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
    const { toast, showToast } = useToast();
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
    const [addingCandidateId, setAddingCandidateId] = useState(null);

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
    const [isCreatingJob, setIsCreatingJob] = useState(false);
    
    // Sharing & External Roles states
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeDropdownJobId, setActiveDropdownJobId] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [externalUsers, setExternalUsers] = useState([]);
    const [sharedUsernames, setSharedUsernames] = useState([]);
    const [loadingShares, setLoadingShares] = useState(false);
    const [viewingSharedList, setViewingSharedList] = useState(null);

    const handleStartEditJob = (job) => {
        setSelectedJob(job);
        setEditingJob(job);
        setEditJobForm({
            title: job.title || '',
            description: job.description || '',
            client_name: job.client_name || '',
            client_phone: job.client_phone || '',
            contact_name: job.contact_name || '',
            account_manager: job.account_manager || '',
            assigned_recruiter: job.assigned_recruiter || '',
            target_date: job.target_date || '',
            job_type: job.job_type || 'Full time',
            job_status: job.job_status || 'In-progress',
            work_experience: job.work_experience || 'None',
            industry: job.industry || 'None',
            salary: job.salary || '',
            required_skills: job.required_skills || ''
        });
    };

    // Dynamic Spreadsheet States
    const [searchQuery, setSearchQuery] = useState('');
    const [cols, setCols] = useState([]);
    const [showColVisibility, setShowColVisibility] = useState(false);
    // Column width/visibility config and drag-to-reorder behavior, extracted
    // to shared hooks (Phase 1). JobsPage-specific extra widths (ai_reason,
    // source) are merged on top of the shared base width map.
    const {
        hiddenColumnKeys, setHiddenColumnKeys,
        toggleColumnVisibility, handleShowAllColumns, handleHideAllColumns,
        BASE_WIDTHS, TH, TD_BASE,
    } = useColumnConfig(cols, { ai_reason: '350px', source: '130px' });
    const {
        draggedColKey, dragOverColKey,
        handleDragStart, handleDragOver, handleDragEnter, handleDragEnd, handleDrop, clearDragOver,
    } = useDraggableColumns(cols, setCols);
    const [columnFilters, setColumnFilters] = useState({});
    const [editCell, setEditCell] = useState(null);
    const [editVal, setEditVal] = useState('');


    const [isParsingJD, setIsParsingJD] = useState(false);

    const onJdDrop = useCallback(async (acceptedFiles) => {
        if (!acceptedFiles || acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];
        const formData = new FormData();
        formData.append('file', file);
        
        setIsParsingJD(true);
        try {
            const res = await apiClient.post(`/api/jobs/parse-document`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            const extracted = res.data || {};
            setNewJob(prev => ({
                ...prev,
                title: extracted.title || prev.title,
                description: extracted.description || prev.description,
                client_name: extracted.client_name || prev.client_name,
                client_phone: extracted.client_phone || prev.client_phone,
                contact_name: extracted.contact_name || prev.contact_name,
                account_manager: extracted.account_manager || prev.account_manager,
                assigned_recruiter: extracted.assigned_recruiter || prev.assigned_recruiter,
                target_date: extracted.target_date || prev.target_date,
                job_type: extracted.job_type || prev.job_type,
                job_status: extracted.job_status || prev.job_status,
                work_experience: extracted.work_experience || prev.work_experience,
                industry: extracted.industry || prev.industry,
                salary: extracted.salary || prev.salary,
                required_skills: extracted.required_skills || prev.required_skills
            }));
            showToast('Job Description parsed and fields auto-filled successfully!');
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to parse JD document', 'error');
        } finally {
            setIsParsingJD(false);
        }
    }, []);

    const { getRootProps: getJdRootProps, getInputProps: getJdInputProps, isDragActive: isJdDragActive } = useDropzone({
        onDrop: onJdDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/msword': ['.doc']
        },
        multiple: false
    });

    const loadCols = () => apiClient.get(`/api/columns`).then(r => {
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
            const r = await apiClient.get(`/api/jobs`);
            setJobs(r.data);
            sessionStorage.setItem('cached_jobs', JSON.stringify(r.data));
            if (selectedJob) {
                const updated = r.data.find(j => j.id === selectedJob.id);
                if (updated) {
                    setSelectedJob(updated);
                    sessionStorage.setItem('cached_selected_job', JSON.stringify(updated));
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Guards against a race condition when the user switches jobs quickly:
    // if an older loadCandidates(jobId) request resolves AFTER a newer one
    // (out-of-order network responses), it must not clobber the candidates
    // list with stale data for a job that's no longer selected.
    const latestCandidatesJobIdRef = useRef(null);
    const loadCandidates = async (jobId) => {
        latestCandidatesJobIdRef.current = jobId;
        try {
            const r = await apiClient.get(`/api/jobs/${jobId}/candidates`);
            sessionStorage.setItem(`cached_job_candidates_${jobId}`, JSON.stringify(r.data));
            if (latestCandidatesJobIdRef.current === jobId) {
                setCandidates(r.data);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const handleOpenShareModal = async (job) => {
        const targetJob = job || selectedJob;
        if (!targetJob) return;
        setSelectedJob(targetJob);
        setLoadingShares(true);
        setShowShareModal(true);
        try {
            const usersRes = await apiClient.get(`/api/admin/users`);
            const external = (usersRes.data || []).filter(u => u.is_external === 1);
            setExternalUsers(external);
            
            const sharesRes = await apiClient.get(`/api/jobs/${targetJob.id}/shares`);
            setSharedUsernames(sharesRes.data || []);
        } catch (e) {
            showToast('Failed to load sharing details', 'error');
        } finally {
            setLoadingShares(false);
        }
    }

    const handleSaveShares = async () => {
        try {
            await apiClient.post(`/api/jobs/${selectedJob.id}/share`, { usernames: sharedUsernames });
            showToast('Sharing permissions updated successfully!');
            setShowShareModal(false);
            loadJobs(); // Refresh jobs to get updated sharing list
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
            sessionStorage.setItem('cached_selected_job', JSON.stringify(selectedJob));
            try {
                const cachedCand = sessionStorage.getItem(`cached_job_candidates_${selectedJob.id}`);
                if (cachedCand) {
                    setCandidates(JSON.parse(cachedCand));
                }
            } catch (e) {}
            loadCandidates(selectedJob.id);
            loadCols();
        } else {
            sessionStorage.removeItem('cached_selected_job');
        }
    }, [selectedJob]);

    useEffect(() => {
        if (!activeDropdownJobId && !showDropdown) return;
        const clickAway = () => {
            setActiveDropdownJobId(null);
            setShowDropdown(false);
        };
        const timer = setTimeout(() => {
            document.addEventListener('click', clickAway);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', clickAway);
        };
    }, [activeDropdownJobId, showDropdown]);

    const handleCreateJob = async () => {
        if (!newJob.title || !newJob.description) return showToast('Title and Description are required', 'error');
        if (isCreatingJob) return;
        setIsCreatingJob(true);
        try {
            const r = await apiClient.post(`/api/jobs`, newJob);
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
        } finally {
            setIsCreatingJob(false);
        }
    }

    const handleDeleteJob = async (jobId) => {
        if (!window.confirm('Delete this job?')) return;
        try {
            await apiClient.delete(`/api/jobs/${jobId}`, {
                headers: { 'x-user-username': user?.username }
            });
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
            const r = await apiClient.post(`/api/jobs/${selectedJob.id}/match`);
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
            const r = await apiClient.get(`/api/jobs/${selectedJob.id}/unmatched-candidates`);
            setUnmatchedCandidates(r.data || []);
        } catch (e) {
            showToast('Failed to load unmatched candidates', 'error');
        } finally {
            setLoadingUnmatched(false);
        }
    }

    const handleAddCandidateManually = async (candidateId) => {
        if (!selectedJob || !candidateId) return;
        // Guard against a double-click firing two duplicate "add candidate to
        // job" requests before the first one resolves and closes the modal.
        if (addingCandidateId) return;
        setAddingCandidateId(candidateId);
        try {
            await apiClient.post(`/api/jobs/${selectedJob.id}/candidates/${candidateId}`);
            showToast('Candidate manually matched to job!');
            loadCandidates(selectedJob.id);
            loadJobs();
            setShowAddCandidateModal(false);
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed to match candidate manually', 'error');
        } finally {
            setAddingCandidateId(null);
        }
    }

    const handleStatusChange = async (candidateId, newStatus) => {
        try {
            await apiClient.put(`/api/jobs/${selectedJob.id}/candidates/${candidateId}`, { status: newStatus });
            
            // Auto-sync: Update candidate profile status in metadata
            const profileStatus = newStatus === 'selected' ? 'Selected' : 'New';
            try {
                await apiClient.put(`/api/candidates/${candidateId}`, { candidate_status: profileStatus });
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
            await apiClient.delete(`/api/jobs/${selectedJob.id}/candidates/${candidateId}`, {
                headers: { 'x-user-username': user?.username }
            });
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
            await apiClient.delete(`/api/candidates/${candidateId}`, {
                headers: { 'x-user-username': user?.username }
            });
            setSelectedCandidateForDetails(null);
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
            await apiClient.put(`/api/candidates/${editingCandidate.id}`, {
                full_name: editName,
                total_experience: editExp,
                skills: editSkills,
                current_location: editCurrentLocation,
                pref_locations: editPrefLocations
            });
            
            // 2. Update Job Candidate specific details (AI Reason)
            await apiClient.put(`/api/jobs/${selectedJob.id}/candidates/${editingCandidate.id}`, {
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
            const r = await apiClient.put(`/api/jobs/${editingJob.id}`, editJobForm);
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

    // Column visibility (toggleColumnVisibility/handleShowAllColumns/handleHideAllColumns)
    // and drag-to-reorder handlers (handleDragStart/handleDragOver/handleDragEnter/
    // handleDragEnd/handleDrop) now come from useColumnConfig/useDraggableColumns above.

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

    const activeCols = isExternal 
        ? cols.filter(c => ['full_name', 'ai_reason', 'candidate_status'].includes(c.key))
        : cols.filter(c => c.key === '_actions' || !hiddenColumnKeys.includes(c.key))

    const getTableWidth = () => computeTableWidth(activeCols)

    // Inline edit cell handlers
    const startEdit = (ri, col, val) => {
        if (isExternal) return;
        const isAdmin = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1;
        if (col === 'certifications' && !isAdmin) {
            showToast("Only Admins can view or edit certifications.", "error");
            return;
        }
        if (val === '[HIDDEN]') {
            showToast("This field is hidden by the administrator.", "error");
            return;
        }
        setEditCell({ row: ri, col });
        setEditVal(String(val || ''));
    }
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
                await apiClient.put(`/api/jobs/${selectedJob.id}/candidates/${c.id}`, { ai_reason: finalVal });
                setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, ai_reason: finalVal } : row));
            } else {
                await apiClient.put(`/api/candidates/${c.id}`, { [editCell.col]: finalVal });
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
        if (!isExternal && c.job_status !== activeTab) return false;
        
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
            <JobSidebar
                isExternal={isExternal}
                isAdmin={isAdmin}
                filteredJobs={filteredJobs}
                selectedJob={selectedJob}
                setSelectedJob={setSelectedJob}
                setShowNewForm={setShowNewForm}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                activeDropdownJobId={activeDropdownJobId}
                setActiveDropdownJobId={setActiveDropdownJobId}
                setShowDropdown={setShowDropdown}
                handleOpenShareModal={handleOpenShareModal}
                handleStartEditJob={handleStartEditJob}
                handleDeleteJob={handleDeleteJob}
                setViewingSharedList={setViewingSharedList}
            />

            {/* Main Content: Job Details */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', overflow: 'hidden' }}>
                {showNewForm ? (
                    <NewJobForm
                        newJob={newJob}
                        setNewJob={setNewJob}
                        getJdRootProps={getJdRootProps}
                        getJdInputProps={getJdInputProps}
                        isJdDragActive={isJdDragActive}
                        isParsingJD={isParsingJD}
                        setShowNewForm={setShowNewForm}
                        handleCreateJob={handleCreateJob}
                        isCreatingJob={isCreatingJob}
                    />
                ) : selectedJob ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', minWidth: 0, width: '100%' }}>
                        <JobDetailPanel
                            selectedJob={selectedJob}
                            setSelectedJob={setSelectedJob}
                            isExternal={isExternal}
                            isAdmin={isAdmin}
                            showDropdown={showDropdown}
                            setShowDropdown={setShowDropdown}
                            handleOpenShareModal={handleOpenShareModal}
                            handleStartEditJob={handleStartEditJob}
                            handleDeleteJob={handleDeleteJob}
                            isEditingJdInline={isEditingJdInline}
                            setIsEditingJdInline={setIsEditingJdInline}
                            jdInlineValue={jdInlineValue}
                            setJdInlineValue={setJdInlineValue}
                            jobs={jobs}
                            setJobs={setJobs}
                            showToast={showToast}
                            loadCandidates={loadCandidates}
                            handleMatch={handleMatch}
                            isMatching={isMatching}
                            setViewingSharedList={setViewingSharedList}
                        />

                        <CandidatesTable
                            isExternal={isExternal}
                            selectedJob={selectedJob}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                            cols={cols}
                            showColVisibility={showColVisibility}
                            setShowColVisibility={setShowColVisibility}
                            hiddenColumnKeys={hiddenColumnKeys}
                            toggleColumnVisibility={toggleColumnVisibility}
                            handleShowAllColumns={handleShowAllColumns}
                            handleHideAllColumns={handleHideAllColumns}
                            draggedColKey={draggedColKey}
                            dragOverColKey={dragOverColKey}
                            handleDragStart={handleDragStart}
                            handleDragOver={handleDragOver}
                            handleDragEnter={handleDragEnter}
                            handleDragEnd={handleDragEnd}
                            handleDrop={handleDrop}
                            clearDragOver={clearDragOver}
                            TH={TH}
                            TD_BASE={TD_BASE}
                            columnFilters={columnFilters}
                            setColumnFilters={setColumnFilters}
                            activeCols={activeCols}
                            getTableWidth={getTableWidth}
                            filteredCandidates={filteredCandidates}
                            editCell={editCell}
                            setEditCell={setEditCell}
                            editVal={editVal}
                            setEditVal={setEditVal}
                            startEdit={startEdit}
                            saveEdit={saveEdit}
                            setCandidates={setCandidates}
                            showToast={showToast}
                            setSelectedCandidateForDetails={setSelectedCandidateForDetails}
                            setSelectedCellText={setSelectedCellText}
                            handleStatusChange={handleStatusChange}
                            setEditingCandidate={setEditingCandidate}
                            setEditName={setEditName}
                            setEditExp={setEditExp}
                            setEditSkills={setEditSkills}
                            setEditReason={setEditReason}
                            setEditCurrentLocation={setEditCurrentLocation}
                            setEditPrefLocations={setEditPrefLocations}
                            handleRemoveFromJob={handleRemoveFromJob}
                            handleDeleteCandidate={handleDeleteCandidate}
                        />
                    </div>
                ) : (
                    <JobsOverview
                        jobs={jobs}
                        filteredJobs={filteredJobs}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        setSelectedJob={setSelectedJob}
                        isExternal={isExternal}
                        handleOpenShareModal={handleOpenShareModal}
                        handleDeleteJob={handleDeleteJob}
                        setViewingSharedList={setViewingSharedList}
                    />
                )}
            </div>

            <EditCandidateModal
                editingCandidate={editingCandidate}
                setEditingCandidate={setEditingCandidate}
                editName={editName}
                setEditName={setEditName}
                editExp={editExp}
                setEditExp={setEditExp}
                editSkills={editSkills}
                setEditSkills={setEditSkills}
                editReason={editReason}
                setEditReason={setEditReason}
                editCurrentLocation={editCurrentLocation}
                setEditCurrentLocation={setEditCurrentLocation}
                editPrefLocations={editPrefLocations}
                setEditPrefLocations={setEditPrefLocations}
                handleSaveCandidateEdit={handleSaveCandidateEdit}
                isSavingEdit={isSavingEdit}
            />

            <EditJobModal
                editingJob={editingJob}
                setEditingJob={setEditingJob}
                editJobForm={editJobForm}
                setEditJobForm={setEditJobForm}
                handleSaveJobEdit={handleSaveJobEdit}
                isSavingJob={isSavingJob}
            />

            {/* Candidate Details Modal */}
            {/*
              onToggleStatus + onDeleteCandidate present, no editable/showExportDocx/
              showFormattedToggle overrides: this reproduces JobsPage's original
              module-level CandidateDetailsModal exactly via the shared component's
              defaults — canEdit = Boolean(onToggleStatus) = true (formatted-resume
              Edit button shown), canExportDocx = Boolean(onToggleStatus) = true
              (Alamaticz Format download button always shown, matching the original's
              unconditional button), canToggleFormatted = !onToggleStatus = false (no
              separate View/Hide toggle — the formatted panel auto-shows once
              jobStatus === 'selected', same as before).
              defaultResumeTemplate={resumeTemplate} seeds the shared modal's own
              template state from the org's fetched default template (loaded above via
              /api/integrations). The original module-level component referenced a
              bare `resumeTemplate`/`setResumeTemplate` that were actually JobsPage's
              own state from a separate function scope — an unbound-identifier
              ReferenceError the moment the formatted panel rendered (documented in
              CandidateDetailsModal.jsx's file header). The shared component fixes
              this by owning that state itself; passing the fetched default here
              preserves the original intent (use the org's configured template)
              without reintroducing the crash.
            */}
            {selectedCandidateForDetails && (
                <CandidateDetailsModal
                    candidate={selectedCandidateForDetails}
                    onClose={() => setSelectedCandidateForDetails(null)}
                    onViewPdf={(filename, name) => {
                        setSelectedCandidateForDetails(null);
                        setViewingPdf({ url: getStaticUrl(filename), name });
                    }}
                    onToggleStatus={handleStatusChange}
                    onDeleteCandidate={handleDeleteCandidate}
                    defaultResumeTemplate={resumeTemplate}
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
                <div className="modal-overlay" onClick={() => setViewingPdf(null)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '95%', maxWidth: 1000, height: '90vh',
                        display: 'flex', flexDirection: 'column', padding: 0,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)', borderBottom: '1px solid var(--border)'
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

            <AddCandidateModal
                showAddCandidateModal={showAddCandidateModal}
                setShowAddCandidateModal={setShowAddCandidateModal}
                unmatchedSearchQuery={unmatchedSearchQuery}
                setUnmatchedSearchQuery={setUnmatchedSearchQuery}
                loadingUnmatched={loadingUnmatched}
                unmatchedCandidates={unmatchedCandidates}
                handleAddCandidateManually={handleAddCandidateManually}
                addingCandidateId={addingCandidateId}
            />

            <ShareModal
                viewingSharedList={viewingSharedList}
                setViewingSharedList={setViewingSharedList}
                handleOpenShareModal={handleOpenShareModal}
                showShareModal={showShareModal}
                setShowShareModal={setShowShareModal}
                loadingShares={loadingShares}
                externalUsers={externalUsers}
                sharedUsernames={sharedUsernames}
                setSharedUsernames={setSharedUsernames}
                handleSaveShares={handleSaveShares}
            />

             {toast && (
                 <div className="toast-container">
                     <div className={`toast ${toast.type}`}>{toast.msg}</div>
                 </div>
             )}
        </div>
    );
}
