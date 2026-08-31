import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import apiClient, { getStaticUrl } from '../api/client';
import useColumnConfig from '../hooks/useColumnConfig';
import useDraggableColumns from '../hooks/useDraggableColumns';
import { useToast } from '../hooks/useToast';
import ToastHost from '../components/shared/ToastHost';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { useModalA11y } from '../hooks/useModalA11y';
import { computeTableWidth } from '../utils/tableWidth';
import { applySavedColumnOrder } from '../utils/columnOrder';
import { useInlineCellEdit } from '../hooks/useInlineCellEdit';
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
    const navigate = useNavigate();
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
    // "Why does switching pages take so long": on a first visit this session
    // (no cached_jobs yet), jobs started empty with no loading flag at all,
    // so JobSidebar's "No jobs found matching the selected status" empty
    // state rendered immediately and then silently got replaced by the real
    // list once loadJobs() resolved - a false "nothing here" flash that
    // reads as the page being broken/slow rather than still loading. Only
    // true when there's nothing cached to show in the meantime; a cached
    // list (the common case - revisiting Jobs later in the same session)
    // still renders instantly with no loading flash at all.
    const [loadingJobs, setLoadingJobs] = useState(() => {
        try { return !sessionStorage.getItem('cached_jobs'); } catch { return true; }
    });
    const [selectedJob, setSelectedJob] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('cached_selected_job')) || null;
        } catch { return null; }
    });

    // G-15: below 1100px the fixed 320px job list + detail panel (which
    // itself needs room for a KPI card row) no longer fit side by side
    // without visibly crowding/clipping, so collapse to one visible pane
    // at a time - list by default, switching to the detail panel once a
    // job is selected (same matchMedia pattern as Layout.jsx's sidebar
    // breakpoints). Raised from an earlier 900px cutoff after screenshots
    // at ~950-1000px still showed the detail pane's KPI row overflowing.
    const [isNarrowWidth, setIsNarrowWidth] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1100px)');
        const handler = (e) => setIsNarrowWidth(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
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
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast();
    const { confirm, confirmDialogProps } = useConfirm();
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
    const resumeViewerModalRef = useModalA11y(!!viewingPdf, () => setViewingPdf(null));
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
        
        setCols(applySavedColumnOrder(allLoaded, 'hire_ai_job_col_order'))
    }).catch(() => {
        // G-20: used to fail silently, leaving whatever default columns
        // useColumnConfig started with and no signal that the real column
        // config never loaded.
        showToast('Failed to load column settings.', 'error')
    })

    const loadJobs = async () => {
        try {
            const r = await apiClient.get(`/api/jobs`, { headers: { 'x-user-username': user?.username } });
            setJobs(r.data);
            sessionStorage.setItem('cached_jobs', JSON.stringify(r.data));
            // "Back to Jobs" bug: this closes over `selectedJob` as of whenever
            // loadJobs() was called. Several call sites fire it from an async
            // callback (job edit/share/delete), so by the time the response
            // lands the user may have already clicked "Back to Jobs" in a
            // later render - but this stale closure still saw the old
            // non-null selectedJob and re-selected it right out from under
            // them, one tick after they navigated away. The functional-update
            // form reads the CURRENT state instead of the captured closure,
            // same fix already applied to pollForJobMatches below.
            setSelectedJob(prev => {
                if (!prev) return prev;
                const updated = r.data.find(j => j.id === prev.id);
                if (updated) sessionStorage.setItem('cached_selected_job', JSON.stringify(updated));
                return updated || prev;
            });
            setLoadingJobs(false);
        } catch (e) {
            setLoadingJobs(false);
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

    // Candidate matching now runs as a backend background task (jobs.py) instead
    // of blocking the create/update request, so matched_count/selected_count are
    // still 0 in the response that comes back immediately. This polls a few times
    // so the UI catches up once matching actually finishes, instead of looking
    // like matching silently broke. Self-contained on purpose (functional
    // setSelectedJob update, no captured `selectedJob`/`jobs` from the render
    // that scheduled it) so it can't act on stale state from an earlier render.
    const pollForJobMatches = (jobId, remainingAttempts = 6) => {
        if (remainingAttempts <= 0) return;
        setTimeout(async () => {
            let updated = null;
            try {
                const r = await apiClient.get(`/api/jobs`, { headers: { 'x-user-username': user?.username } });
                setJobs(r.data);
                sessionStorage.setItem('cached_jobs', JSON.stringify(r.data));
                updated = r.data.find(j => j.id === jobId) || null;
                if (updated) {
                    // Same stale-write bug as loadJobs() above: only touch
                    // sessionStorage when we're actually keeping this job
                    // selected, not unconditionally on every poll tick.
                    setSelectedJob(prev => {
                        if (!(prev && prev.id === jobId)) return prev;
                        sessionStorage.setItem('cached_selected_job', JSON.stringify(updated));
                        return updated;
                    });
                }
                loadCandidates(jobId);
            } catch (e) {
                // ignore, retry on next tick
            }
            if (updated && (updated.matched_count > 0 || updated.selected_count > 0)) return;
            pollForJobMatches(jobId, remainingAttempts - 1);
        }, 3000);
    };

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
            showToast('Job Created! Matching candidates...');
            pollForJobMatches(r.data.id);
        } catch (e) {
            showToast('Failed to create job', 'error');
        } finally {
            setIsCreatingJob(false);
        }
    }

    const handleDeleteJob = async (jobId) => {
        const job = jobs.find(j => j.id === jobId);
        const matched = (job?.matched_count || 0) + (job?.selected_count || 0);
        if (!await confirm({
            title: 'Delete job?',
            message: `This permanently deletes "${job?.title || 'this job'}"${matched > 0 ? ` and its matching for ${matched} candidate${matched === 1 ? '' : 's'}` : ''}. This cannot be undone.`,
            confirmLabel: 'Delete',
        })) return;
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
        if (!await confirm({ title: 'Remove candidate?', message: 'Remove this candidate from this job?', confirmLabel: 'Remove' })) return;
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
        if (!await confirm({ title: 'Delete candidate?', message: 'Delete this candidate completely from the database? This cannot be undone.', confirmLabel: 'Delete permanently' })) return;
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
            showToast('Job updated! Re-matching candidates...');
            loadCandidates(editingJob.id);
            pollForJobMatches(editingJob.id);
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
    const { startEdit, saveEdit } = useInlineCellEdit({
        candidates, setCandidates, editCell, setEditCell, editVal, setEditVal, showToast,
        isAdmin, blockAll: isExternal,
        fieldOverrides: {
            ai_reason: (c, finalVal) => apiClient.put(`/api/jobs/${selectedJob.id}/candidates/${c.id}`, { ai_reason: finalVal }),
        },
    });

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

    const showSidebarPane = !isNarrowWidth || (!selectedJob && !showNewForm);
    const showMainPane = !isNarrowWidth || selectedJob || showNewForm;

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {showSidebarPane && (
                <JobSidebar
                    isExternal={isExternal}
                    isAdmin={isAdmin}
                    filteredJobs={filteredJobs}
                    loadingJobs={loadingJobs}
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
                    style={isNarrowWidth ? { width: '100%' } : undefined}
                />
            )}

            {/* Main Content: Job Details */}
            {showMainPane && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', overflow: 'hidden' }}>
                {isNarrowWidth && (showNewForm || selectedJob) && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { setShowNewForm(false); setSelectedJob(null); }}
                        style={{ margin: '10px 14px 0', alignSelf: 'flex-start', fontSize: '0.8rem', padding: '5px 10px' }}
                    >
                        ← Back to jobs
                    </button>
                )}
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
                            confirm={confirm}
                            setSelectedCandidateForDetails={(row) => row && navigate(`/candidates/${row.id}`, { state: { candidate: row } })}
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
            )}

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

            {/* Candidate Details Modal — now unreachable: the shortlist name cell
                routes to /candidates/:id (CandidatePage) instead of opening this
                overlay, per the "make it a page, not a floating window" change.
                Left in place (never rendered, since selectedCandidateForDetails
                stays null) pending a follow-up cleanup pass. */}
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
                    <div ref={resumeViewerModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="jobs-resume-viewer-title" onClick={e => e.stopPropagation()} style={{
                        width: '95%', maxWidth: 1000, height: '90vh',
                        display: 'flex', flexDirection: 'column', padding: 0,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)', borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 id="jobs-resume-viewer-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.05rem' }}>
                                {viewingPdf.name}
                            </h3>
                            <button onClick={() => setViewingPdf(null)} aria-label="Close" style={{
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
                            style={{ width: '100%', flex: 1, border: 'none', background: 'var(--surface-sunken)' }}
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

             <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
             <ConfirmDialog {...confirmDialogProps} />
        </div>
    );
}
