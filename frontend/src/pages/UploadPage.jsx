import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useOutletContext } from 'react-router-dom'
import apiClient, { getStaticUrl } from '../api/client'
import useColumnConfig from '../hooks/useColumnConfig'
import useDraggableColumns from '../hooks/useDraggableColumns'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { computeTableWidth } from '../utils/tableWidth'
import { applySavedColumnOrder } from '../utils/columnOrder'
import { useInlineCellEdit } from '../hooks/useInlineCellEdit'
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
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
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


    // Pagination: GET /api/candidates used to always return every visible
    // candidate in one unbounded response, hit by this page's own 20s
    // baseline poll on top of the initial load. `load()` now fetches only
    // the first PAGE_SIZE (most-recently-updated first, same ORDER BY the
    // backend always used), and `loadMore()` fetches subsequent pages on
    // demand via a "Load More" control. Per-request payload size is now
    // bounded regardless of how large the candidates table grows.
    //
    // Trade-off (chosen deliberately, not a bug): filtering/search only
    // operates on whatever pages have been loaded into `candidates` so far,
    // not the full server-side dataset, until the user loads more. This
    // matches the previous "load everything, filter client-side" behavior
    // exactly for anyone who never needs more than PAGE_SIZE candidates
    // (the common case), and only changes anything once a table has more
    // than PAGE_SIZE rows.
    const PAGE_SIZE = 200
    const [totalCandidates, setTotalCandidates] = useState(0)
    const [loadingMore, setLoadingMore] = useState(false)
    // lastLoadedRef holds the last JSON payload actually applied to state, so a
    // silent poll tick that gets back the exact same first page (the common
    // case -- nothing changed since the last tick) can skip setCandidates/
    // sessionStorage entirely instead of forcing a re-render and a full
    // JSON.stringify + storage write on every single tick.
    const lastLoadedRef = useRef(null)
    const load = (silent = false) => {
        if (!silent) setLoadingCandidates(true);
        return apiClient.get(`/api/candidates`, { params: { limit: PAGE_SIZE, offset: 0 } })
            .then(r => {
                const { items, total } = r.data;
                const raw = JSON.stringify(items);
                setTotalCandidates(total);
                if (raw === lastLoadedRef.current) return;
                lastLoadedRef.current = raw;
                // Replace only the first page; anything loaded beyond it via
                // loadMore() stays as-is so a poll tick can't discard pages
                // the user already fetched.
                setCandidates(prev => {
                    const rest = prev.slice(PAGE_SIZE);
                    const merged = [...items, ...rest];
                    sessionStorage.setItem('cached_candidates', JSON.stringify(merged));
                    return merged;
                });
            })
            .catch(err => {
                console.error("Failed to load candidates", err);
                if (!silent) showToast("Failed to load candidates", "error");
            })
            .finally(() => {
                if (!silent) setLoadingCandidates(false);
            });
    }
    const loadMore = () => {
        if (loadingMore) return;
        setLoadingMore(true);
        return apiClient.get(`/api/candidates`, { params: { limit: PAGE_SIZE, offset: candidates.length } })
            .then(r => {
                const { items, total } = r.data;
                setTotalCandidates(total);
                setCandidates(prev => {
                    const merged = [...prev, ...items];
                    sessionStorage.setItem('cached_candidates', JSON.stringify(merged));
                    return merged;
                });
            })
            .catch(err => {
                console.error("Failed to load more candidates", err);
                showToast("Failed to load more candidates", "error");
            })
            .finally(() => setLoadingMore(false));
    }
    const handleAddCandidateSubmit = async () => {
        if (!newCandidateForm.full_name || !newCandidateForm.full_name.trim()) {
            showToast("Candidate Name is required!", "error");
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
            showToast(err.response?.data?.detail || "Failed to add candidate", "error");
        } finally {
            setIsAddingCandidate(false);
        }
    };
    const loadCols = () => apiClient.get(`/api/columns`).then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: getColumnWidth(c.col_key), col_key: c.col_key, col_label: c.col_label }))
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '120px', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        const allLoaded = [...base, ...custom, { key: '_actions', label: 'Actions', pct: '100px' }]

        setCols(applySavedColumnOrder(allLoaded, 'hire_ai_col_order'))
    }).catch(() => {
        // G-20: used to fail silently, leaving whatever default columns
        // useColumnConfig started with and no signal that the real column
        // config never loaded.
        showToast('Failed to load column settings.', 'error')
    })



    useEffect(() => {
        load();
        loadCols();

        // Baseline silent poll for candidates added by other users/the email
        // worker. Was every 5s unconditionally for as long as this page stayed
        // open -- the single heaviest, most constant load on /api/candidates
        // (itself an unbounded, unpaginated query) in the whole app. The two
        // effects below already cover the cases that actually need fast
        // polling (a resume is actively processing, or a file just finished
        // uploading), so this baseline only needs to be "eventually fresh"
        // for everything else -- 20s cuts request volume by 4x with no
        // noticeable difference for that slower-moving case. `load()` itself
        // also now skips the state update entirely when the response is
        // byte-identical to what's already loaded, so an unchanged tick no
        // longer forces a re-render or a sessionStorage write either.
        const interval = setInterval(() => {
            load(true);
        }, 20000);

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
        if (!await confirm({ title: 'Delete column?', message: `Are you sure you want to delete the "${label}" column?`, confirmLabel: 'Delete' })) return
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

    const isAdmin = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1;
    const { startEdit, saveEdit } = useInlineCellEdit({
        candidates, setCandidates, editCell, setEditCell, editVal, setEditVal, showToast,
        isAdmin, certificationsMessage: "Only Admins and HR users can view or edit certifications.",
    });
    const del = async (id) => {
        if (!await confirm({ title: 'Delete candidate?', message: 'Are you sure you want to delete this candidate?', confirmLabel: 'Delete' })) return
        try {
            await apiClient.delete(`/api/candidates/${id}`, {
                headers: { 'x-user-username': user?.username }
            });
            setCandidates(p => p.filter(c => c.id !== id));
            setTotalCandidates(t => Math.max(0, t - 1));
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
        if (!await confirm({ title: 'Delete selected candidates?', message: `Are you sure you want to delete ${selectedIds.size} selected candidate(s)?`, confirmLabel: 'Delete' })) return
        try {
            await apiClient.post(`/api/candidates/bulk-delete`, { ids: [...selectedIds] }, {
                headers: { 'x-user-username': user?.username }
            })
            setCandidates(prev => prev.filter(c => !selectedIds.has(c.id)))
            setTotalCandidates(t => Math.max(0, t - selectedIds.size))
            setSelectedIds(new Set())
            showToast(`Deleted ${selectedIds.size} candidate(s)`)
        } catch { showToast('Bulk delete failed', 'error') }
    }

    const getTableWidth = () => computeTableWidth(activeCols, 60 + 45) // + S.No column + checkbox column

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
                confirm={confirm}
                setSelectedCandidateForDetails={setSelectedCandidateForDetails}
                del={del}
                loadingCandidates={loadingCandidates}
                load={load}
                loadCols={loadCols}
                totalCandidates={totalCandidates}
                loadingMore={loadingMore}
                loadMore={loadMore}
            />

            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            <ConfirmDialog {...confirmDialogProps} />

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
