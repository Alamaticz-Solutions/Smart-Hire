import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useOutletContext } from 'react-router-dom'
import apiClient, { getStaticUrl } from '../api/client'
import useColumnConfig from '../hooks/useColumnConfig'
import useDraggableColumns from '../hooks/useDraggableColumns'
import CandidateDetailsModal from '../components/shared/CandidateDetailsModal'
import UploadDropzone from './upload/UploadDropzone'
import CandidatesTable from './upload/CandidatesTable'
import FilterModal from './upload/FilterModal'
import ResumeViewerModal from './upload/ResumeViewerModal'

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function UploadPage() {
    const { user } = useOutletContext()
    const [candidates, setCandidates] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem('cached_candidates')) || [];
        } catch { return []; }
    })
    const [progress, setProgress] = useState([])
    const [toast, setToast] = useState(null)
    const [editCell, setEditCell] = useState(null)
    const [editVal, setEditVal] = useState('')
    const [cols, setCols] = useState([])
    const [showAddCol, setShowAddCol] = useState(false)
    const [showAddCandidate, setShowAddCandidate] = useState(false)
    const [newCandidateForm, setNewCandidateForm] = useState({})
    const [viewingPdf, setViewingPdf] = useState(null)
    const [selectedCandidateForDetails, setSelectedCandidateForDetails] = useState(null)
    const [showFilter, setShowFilter] = useState(false)
    const [filters, setFilters] = useState({ minTotalExp: '', minPegaExp: '', certs: [] })
    const [customFilters, setCustomFilters] = useState([])
    const [columnFilters, setColumnFilters] = useState({})
     const [activeTab, setActiveTab] = useState('all') // 'all' or 'qualified'
    const [newColForm, setNewColForm] = useState({ label: '', desc: '' })




    const [showColVisibility, setShowColVisibility] = useState(false)
    const [loadingCandidates, setLoadingCandidates] = useState(false)
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [isAddingCandidate, setIsAddingCandidate] = useState(false)

    // Column width map: shared base widths plus UploadPage's own `sender_email` column
    // (the email a resume was received from), per useColumnConfig's docstring.
    const {
        hiddenColumnKeys,
        toggleColumnVisibility,
        handleShowAllColumns,
        handleHideAllColumns,
        getColumnWidth,
        TH,
        TD_BASE,
    } = useColumnConfig(cols, { sender_email: '220px' })

    const {
        draggedColKey,
        dragOverColKey,
        handleDragStart,
        handleDragOver,
        handleDragEnter,
        handleDragEnd,
        handleDrop,
        clearDragOver,
    } = useDraggableColumns(cols, setCols)

    useEffect(() => {
        if (cols.length > 0) {
            localStorage.setItem('hire_ai_col_order', JSON.stringify(cols.map(c => c.key).filter(k => k !== '_actions')))
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

    const PEGA_CERTS = ['CSA', 'CSSA', 'LSA', 'CPDC']

    const toggleCert = (cert) => {
        setFilters(prev => ({
            ...prev,
            certs: prev.certs.includes(cert)
                ? prev.certs.filter(c => c !== cert)
                : [...prev.certs, cert]
        }))
    }

    const filteredCandidates = candidates.filter(candidate => {
        // Tab Filtering
        if (activeTab === 'qualified' && candidate.is_qualified !== 1) return false;

        const tExp = parseFloat(candidate.total_experience) || 0;
        const pExp = parseFloat(candidate.pega_experience) || 0;

        if (filters.minTotalExp !== '' && tExp < parseFloat(filters.minTotalExp)) return false;
        if (filters.minPegaExp !== '' && pExp < parseFloat(filters.minPegaExp)) return false;

        if (filters.certs.length > 0) {
            const cStr = (candidate.certifications || '').toLowerCase();
            const hasCerts = filters.certs.some(cert => cStr.includes(cert.toLowerCase()));
            if (!hasCerts) return false;
        }

        // Custom Filters
        for (const cf of customFilters) {
            if (cf.col && cf.val) {
                const cVal = String(candidate[cf.col] || '').toLowerCase();
                if (!cVal.includes(cf.val.toLowerCase())) return false;
            }
        }

        // Inline Column Filters
        for (const [colKey, filterVal] of Object.entries(columnFilters)) {
            if (filterVal) {
                const cVal = String(candidate[colKey] || '').toLowerCase();
                if (!cVal.includes(filterVal.toLowerCase())) return false;
            }
        }

        return true;
    });

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
    const load = (silent = false) => {
        if (!silent) setLoadingCandidates(true);
        return apiClient.get(`/api/candidates`)
            .then(r => {
                setCandidates(r.data);
                sessionStorage.setItem('cached_candidates', JSON.stringify(r.data));
            })
            .catch(err => {
                console.error("Failed to load candidates", err);
                if (!silent) showToast("Failed to load candidates", "error");
            })
            .finally(() => {
                if (!silent) setLoadingCandidates(false);
            });
    }
    const handleAddCandidateSubmit = async () => {
        if (!newCandidateForm.full_name || !newCandidateForm.full_name.trim()) {
            alert("Candidate Name is required!");
            return;
        }
        // Guard against a double-click firing two duplicate candidate
        // creations before the first request resolves and closes the modal.
        if (isAddingCandidate) return;
        setIsAddingCandidate(true);
        try {
            await apiClient.post(`/api/candidates`, newCandidateForm);
            showToast("Candidate added successfully!");
            setShowAddCandidate(false);
            load();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to add candidate");
        } finally {
            setIsAddingCandidate(false);
        }
    };
    const loadCols = () => apiClient.get(`/api/columns`).then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: getColumnWidth(c.col_key), col_key: c.col_key, col_label: c.col_label }))
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '120px', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        const allLoaded = [...base, ...custom, { key: '_actions', label: 'Actions', pct: '100px' }]

        const savedOrder = localStorage.getItem('hire_ai_col_order')
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



    useEffect(() => {
        load();
        loadCols();

        // Poll for new candidates automatically every 5 seconds (silent refresh)
        const interval = setInterval(() => {
            load(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [])

    // Polling mechanism to auto-refresh the table when resumes are processing in the background
    useEffect(() => {
        const hasProcessing = candidates.some(c => c.full_name && c.full_name.includes('Processing'));
        if (hasProcessing) {
            const timer = setInterval(() => {
                load(true);
            }, 3000);
            return () => clearInterval(timer);
        }
    }, [candidates]);

    // Polling mechanism to auto-refresh the table for 15 seconds after any file upload completes (e.g. Excel)
    useEffect(() => {
        const anyDone = progress.some(p => p.status === 'done');
        if (anyDone) {
            const timer = setInterval(() => {
                load(true);
            }, 3000);
            const timeout = setTimeout(() => {
                clearInterval(timer);
            }, 15000);
            return () => {
                clearInterval(timer);
                clearTimeout(timeout);
            };
        }
    }, [progress]);

    const handleDeleteCol = async (col_key, col_label) => {
        const label = col_label || col_key;
        if (!window.confirm(`Are you sure you want to delete the "${label}" column?`)) return
        try {
            await apiClient.delete(`/api/columns/${col_key}`, { headers: { 'x-user-username': user?.username } })
            showToast('Column deleted')
            loadCols()
        } catch (e) { showToast(e.response?.data?.detail || 'Delete failed', 'error') }
    }

    const handleAddCol = async () => {
        if (!newColForm.label || !newColForm.desc) return showToast('Please fill all fields', 'error')
        try {
            const col_key = newColForm.label.replace(/[^a-zA-Z0-9_]/g, '').replace(/\s+/g, '_').toLowerCase()
            await apiClient.post(`/api/columns`, { col_key, col_label: newColForm.label, description: newColForm.desc })
            setShowAddCol(false)
            setNewColForm({ label: '', desc: '' })
            loadCols()
            showToast('Column added!')
        } catch (e) { showToast(e.response?.data?.detail || 'Add failed', 'error') }
    }

    const onDrop = useCallback(async (files) => {
        if (!files.length) return
        setProgress(files.map(f => ({ name: f.name, status: 'pending', percent: 0 })))
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData(); fd.append('file', files[i])
            setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'processing', percent: 10 } : x))
            try {
                await apiClient.post(`/api/upload`, fd, {
                    onUploadProgress: ev => {
                        const pct = Math.round((ev.loaded / ev.total) * 70)
                        setProgress(p => p.map((x, idx) => idx === i ? { ...x, percent: 10 + pct } : x))
                    }
                })
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'done', percent: 100 } : x))
            } catch {
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'error', percent: 0 } : x))
            }
        }
        load()
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv']
        },
        multiple: true,
    })

    const startEdit = (ri, col, val) => {
        const isAdmin = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1;
        if (col === 'certifications' && !isAdmin) {
            showToast("Only Admins and HR users can view or edit certifications.", "error");
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
            await apiClient.put(`/api/candidates/${c.id}`, { [editCell.col]: finalVal })
            setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: finalVal } : row))
            showToast('Saved!')
        } catch (e) { showToast(e.response?.data?.detail || 'Save failed', 'error') }
        setEditCell(null)
    }
    const del = async (id) => {
        if (!window.confirm('Delete this candidate?')) return
        try {
            await apiClient.delete(`/api/candidates/${id}`, {
                headers: { 'x-user-username': user?.username }
            });
            setCandidates(p => p.filter(c => c.id !== id));
            setSelectedCandidateForDetails(null);
            showToast('Deleted')
        } catch { showToast('Delete failed', 'error') }
    }

    const toggleSelectCandidate = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredCandidates.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredCandidates.map(c => c.id)))
        }
    }
    const bulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected candidate(s)?`)) return
        try {
            await apiClient.post(`/api/candidates/bulk-delete`, { ids: [...selectedIds] }, {
                headers: { 'x-user-username': user?.username }
            })
            setCandidates(prev => prev.filter(c => !selectedIds.has(c.id)))
            setSelectedIds(new Set())
            showToast(`Deleted ${selectedIds.size} candidate(s)`)
        } catch { showToast('Bulk delete failed', 'error') }
    }

    const getTableWidth = () => {
        let total = 60 + 45 // Width for S.No column + checkbox column
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

    return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0, width: '100%' }}>

            <UploadDropzone
                getRootProps={getRootProps}
                getInputProps={getInputProps}
                isDragActive={isDragActive}
                progress={progress}
            />

            <CandidatesTable
                candidates={candidates}
                filteredCandidates={filteredCandidates}
                cols={cols}
                activeCols={activeCols}
                TH={TH}
                TD_BASE={TD_BASE}
                getTableWidth={getTableWidth}
                hiddenColumnKeys={hiddenColumnKeys}
                toggleColumnVisibility={toggleColumnVisibility}
                handleShowAllColumns={handleShowAllColumns}
                handleHideAllColumns={handleHideAllColumns}
                showColVisibility={showColVisibility}
                setShowColVisibility={setShowColVisibility}
                draggedColKey={draggedColKey}
                dragOverColKey={dragOverColKey}
                handleDragStart={handleDragStart}
                handleDragOver={handleDragOver}
                handleDragEnter={handleDragEnter}
                handleDragEnd={handleDragEnd}
                handleDrop={handleDrop}
                clearDragOver={clearDragOver}
                handleDeleteCol={handleDeleteCol}
                columnFilters={columnFilters}
                setColumnFilters={setColumnFilters}
                setShowFilter={setShowFilter}
                showAddCandidate={showAddCandidate}
                setShowAddCandidate={setShowAddCandidate}
                newCandidateForm={newCandidateForm}
                setNewCandidateForm={setNewCandidateForm}
                handleAddCandidateSubmit={handleAddCandidateSubmit}
                isAddingCandidate={isAddingCandidate}
                showAddCol={showAddCol}
                setShowAddCol={setShowAddCol}
                newColForm={newColForm}
                setNewColForm={setNewColForm}
                handleAddCol={handleAddCol}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                toggleSelectCandidate={toggleSelectCandidate}
                toggleSelectAll={toggleSelectAll}
                bulkDelete={bulkDelete}
                editCell={editCell}
                setEditCell={setEditCell}
                editVal={editVal}
                setEditVal={setEditVal}
                startEdit={startEdit}
                saveEdit={saveEdit}
                setCandidates={setCandidates}
                showToast={showToast}
                setSelectedCandidateForDetails={setSelectedCandidateForDetails}
                del={del}
                loadingCandidates={loadingCandidates}
                load={load}
                loadCols={loadCols}
            />

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.msg}</div>
                </div>
            )}

            {showFilter && (
                <FilterModal
                    onClose={() => setShowFilter(false)}
                    filters={filters}
                    setFilters={setFilters}
                    PEGA_CERTS={PEGA_CERTS}
                    toggleCert={toggleCert}
                    customFilters={customFilters}
                    setCustomFilters={setCustomFilters}
                    setColumnFilters={setColumnFilters}
                    cols={cols}
                />
            )}

            <ResumeViewerModal
                viewingPdf={viewingPdf}
                onClose={() => setViewingPdf(null)}
            />

            {selectedCandidateForDetails && (
                <CandidateDetailsModal
                    candidate={selectedCandidateForDetails}
                    onClose={() => setSelectedCandidateForDetails(null)}
                    onViewPdf={(filename, name) => {
                        setSelectedCandidateForDetails(null);
                        setViewingPdf({ url: getStaticUrl(filename), name });
                    }}
                    onDeleteCandidate={del}
                />
            )}
        </div>
    )
}
