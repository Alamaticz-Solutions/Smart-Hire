import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Trash2, FileText, Filter, Download, RefreshCw, CheckSquare, Users, Search, X } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../../utils/excelUtils'
import apiClient from '../../api/client'
import ExpandableCell from '../../components/shared/ExpandableCell'
import ColumnVisibilityPopover from '../../components/shared/ColumnVisibilityPopover'
import DataTable from '../../components/shared/DataTable'
import { useModalA11y } from '../../hooks/useModalA11y'

// Extracted from UploadPage.jsx: the "Table" card — header toolbar (Filter
// button, Columns visibility popover, Add Candidate, Add Column, Download
// Excel, Refresh), the bulk-selection banner, the candidates spreadsheet
// itself (draggable/reorderable + hideable column headers, per-column filter
// row, inline cell editing, per-row actions column), plus the two small
// modals it opens directly (Add Candidate, Add Custom Column). Purely
// presentational — the useColumnConfig/useDraggableColumns hooks themselves
// are still called in UploadPage (their outputs are passed down here as
// props), and every piece of state/handler is owned by UploadPage.
//
// Row/header chrome (drag-reorder, filter row, virtualized spacer rows,
// column show/hide) is shared with jobs/CandidatesTable.jsx via
// <DataTable>/<ColumnVisibilityPopover> — this file supplies its own
// `renderRow` for the parts that were never actually identical between the
// two (the bulk-select checkbox + S.No leading columns, and the single
// "Delete" action button, versus Jobs' Select/Deselect/Edit/Remove/Delete
// cluster).
export default function CandidatesTable({
    candidates,
    filteredCandidates,
    cols,
    activeCols,
    TH,
    TD_BASE,
    getTableWidth,
    hiddenColumnKeys,
    toggleColumnVisibility,
    handleShowAllColumns,
    handleHideAllColumns,
    showColVisibility,
    setShowColVisibility,
    draggedColKey,
    dragOverColKey,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragEnd,
    handleDrop,
    clearDragOver,
    handleDeleteCol,
    columnFilters,
    setColumnFilters,
    setShowFilter,
    activeFilterCount,
    showAddCandidate,
    setShowAddCandidate,
    newCandidateForm,
    setNewCandidateForm,
    handleAddCandidateSubmit,
    isAddingCandidate,
    showAddCol,
    setShowAddCol,
    newColForm,
    setNewColForm,
    handleAddCol,
    selectedIds,
    setSelectedIds,
    toggleSelectCandidate,
    toggleSelectAll,
    bulkDelete,
    editCell,
    setEditCell,
    editVal,
    setEditVal,
    startEdit,
    saveEdit,
    setCandidates,
    showToast,
    confirm,
    setSelectedCandidateForDetails,
    loadingCandidates,
    load,
    loadCols,
    totalCandidates,
    loadingMore,
    loadMore,
}) {
    // Virtualization: this table used to mount one real <tr> per row in
    // filteredCandidates, so a table with hundreds/thousands of loaded
    // candidates paid the DOM/layout cost of rendering every row's cells
    // even though only ~15-20 are ever visible in the scrollable viewport
    // at once. rowVirtualizer only mounts the rows currently in (or near)
    // view; everything else is represented by two spacer <tr>s (the
    // standard way to virtualize a real HTML <table> without breaking
    // table layout, since <tr> can't be absolutely positioned the way a
    // virtualized <div> list normally would). `measureElement` re-measures
    // each row's actual rendered height rather than trusting a fixed
    // estimate, since a few columns (full_name/current_organization/email)
    // allow text wrapping and can be taller than a single line.
    const addCandidateModalRef = useModalA11y(showAddCandidate, () => setShowAddCandidate(false))
    const addColModalRef = useModalA11y(showAddCol, () => setShowAddCol(false))
    const tableScrollRef = useRef(null)
    const rowVirtualizer = useVirtualizer({
        count: filteredCandidates.length,
        getScrollElement: () => tableScrollRef.current,
        estimateSize: () => 44,
        overscan: 8,
        measureElement: (el) => el.getBoundingClientRect().height,
    })

    const leadingColumns = [
        {
            key: '_select',
            width: '45px',
            align: 'center',
            headerCursor: 'pointer',
            headerTitle: selectedIds.size === filteredCandidates.length ? 'Deselect all' : 'Select all',
            onHeaderClick: toggleSelectAll,
            renderHeader: () => (
                <input
                    type="checkbox"
                    checked={filteredCandidates.length > 0 && selectedIds.size === filteredCandidates.length}
                    onChange={toggleSelectAll}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredCandidates.length }}
                    style={{ cursor: 'pointer', accentColor: 'var(--gold)', width: 15, height: 15 }}
                    onClick={e => e.stopPropagation()}
                />
            ),
        },
        {
            key: '_sno',
            width: '60px',
            align: 'center',
            filterCellColor: 'var(--gold)',
            renderHeader: () => 'S.No',
            renderFilterCell: () => '#',
        },
    ]

    const renderRow = (row, ri, virtualRow) => (
        <tr key={row.id || ri}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{ background: ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent'}
        >
            <td style={{ ...TD_BASE, textAlign: 'center', padding: '10px 6px' }}>
                <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelectCandidate(row.id)}
                    style={{ cursor: 'pointer', accentColor: 'var(--gold)', width: 15, height: 15 }}
                />
            </td>
            <td style={{ ...TD_BASE, textAlign: 'center', fontWeight: 800, color: 'var(--gold)', borderRight: '1px solid rgba(var(--sky-rgb), 0.07)' }}>
                {ri + 1}
            </td>
            {activeCols.map(({ key }) => {
                const isEditing = editCell?.row === ri && editCell?.col === key
                const val = row[key] ?? ''
                const isExp = key === 'total_experience' || key === 'pega_experience' || key === 'cdh_exp'
                const isExpandable = key === 'skills' || key === 'certifications'

                /* ── Inline edit mode ── */
                if (isEditing) {
                    if (key === 'candidate_status') {
                        const statusOptions = ['New', 'In-Review', 'Available', 'Selected', 'Rejected', 'Engaged', 'Offered', 'Hired'];
                        return (
                            <td key={key} style={TD_BASE}>
                                <select
                                    autoFocus
                                    value={editVal || 'New'}
                                    onChange={async (e) => {
                                        const newVal = e.target.value;
                                        setEditVal(newVal);
                                        try {
                                            await apiClient.put(`/api/candidates/${row.id}`, { candidate_status: newVal });
                                            setCandidates(prev => prev.map((r, i) => i === ri ? { ...r, candidate_status: newVal } : r));
                                            showToast('Saved!');
                                        } catch (err) {
                                            showToast(err.response?.data?.detail || 'Save failed', 'error');
                                        }
                                        setEditCell(null);
                                    }}
                                    onBlur={() => setEditCell(null)}
                                    onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
                                    style={{
                                        background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                        borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                        fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                    }}
                                >
                                    {statusOptions.map(opt => (
                                        <option key={opt} value={opt} style={{ background: 'var(--card-bg)', color: 'var(--text)' }}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </td>
                        );
                    }

                    return (
                        <td key={key} style={TD_BASE}>
                            <input autoFocus value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={() => saveEdit(ri)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(ri); if (e.key === 'Escape') setEditCell(null) }}
                                style={{
                                    background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                    borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                    fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                }}
                            />
                        </td>
                    );
                }

                /* ── Expandable (skills / certs) — td stays overflow:hidden ── */
                // G-33: see jobs/CandidatesTable.jsx's identical comment - a
                // single-value cell renders no ExpandableCell button at all,
                // so this td needs its own keyboard path to startEdit.
                if (isExpandable) return (
                    <td
                        key={key}
                        tabIndex={0}
                        style={{ ...TD_BASE }}
                        onDoubleClick={() => startEdit(ri, key, val)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(ri, key, val) } }}
                    >
                        <ExpandableCell value={val} onEdit={() => startEdit(ri, key, val)} />
                    </td>
                )

                /* ── Regular cells ── */
                let display;
                if (key === 'candidate_status') {
                    const s = String(val || 'New').trim();
                    const statusClass = 'status-' + s.toLowerCase().replace(/\s+/g, '-');
                    display = (
                        <span
                            className={`status-chip ${statusClass}`}
                            title={s === 'Error' && row.error_detail ? row.error_detail : undefined}
                        >
                            {s}
                        </span>
                    );
                } else if (isExp) {
                    display = (val !== '' && val != null ? (val === '[HIDDEN]' ? '[HIDDEN]' : `${val} yrs`) : '—');
                } else if (key === 'notice_period' || key === 'availability_in_days') {
                    display = (val === '[HIDDEN]') ? '[HIDDEN]' : ((val === 0 || val === '0') ? 'Immediate' : (val !== null && val !== '' && !isNaN(val) ? `${val} days` : (val || '—')));
                } else {
                    display = (val !== '' && val != null ? val : '—');
                }
                // G-33: single-click vs double-click meant different things
                // with no keyboard equivalent for either. Enter/Space now
                // triggers whichever one this cell would otherwise need a
                // mouse gesture for.
                const activateCell = () => {
                    if (key === 'full_name') return // has its own focusable control below
                    startEdit(ri, key, val);
                };
                return (
                    <td
                        key={key}
                        tabIndex={key === 'full_name' ? undefined : 0}
                        onClick={() => {
                            if (key === 'candidate_status') startEdit(ri, key, val);
                        }}
                        onDoubleClick={() => {
                            if (key !== 'candidate_status') startEdit(ri, key, val);
                        }}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && key !== 'full_name') { e.preventDefault(); activateCell() } }}
                        style={{
                            ...TD_BASE,
                            color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                            fontWeight: key === 'full_name' ? 700 : undefined,
                            /* overflow already hidden via TD_BASE — text clips cleanly */
                            whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                ? 'normal' : 'nowrap',
                            wordBreak: key === 'email' ? 'break-all' : undefined,
                            cursor: key === 'candidate_status' ? 'pointer' : 'text',
                        }}>
                        {key === 'full_name' ? (
                            <button
                                type="button"
                                onClick={() => setSelectedCandidateForDetails(row)}
                                style={{
                                    /* A long name wraps to 2 lines inside this narrow column - as
                                       inline-flex with alignItems:center, the icon centered itself
                                       against the full wrapped-block height (floating between the
                                       lines) while the text's own box, sized to its unwrapped
                                       preferred width, drifted right of the icon instead of
                                       staying flush left under it. display:flex + width:100% +
                                       alignItems:flex-start pins the icon to line 1's top and
                                       keeps both wrapped lines left-aligned under it. */
                                    display: 'flex', width: '100%', alignItems: 'flex-start', gap: '6px', color: 'var(--gold)',
                                    textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, transition: 'color 0.2s',
                                    background: 'none', border: 'none', padding: 0, font: 'inherit', textAlign: 'left',
                                }}
                                title="View Candidate Details"
                            >
                                <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                {display}
                            </button>
                        ) : display}
                    </td>
                )
            })}
        </tr>
    )

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
            <div className="section-header" style={{ borderBottom: '1px solid rgba(var(--sky-rgb), 0.2)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="section-title"><Users size={18} /> Candidate Profiles</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start', marginTop: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => setShowFilter(true)} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                        <Filter size={14} /> Filter
                        {activeFilterCount > 0 && (
                            <span style={{
                                background: 'var(--gold)', color: 'var(--action-fg)', borderRadius: '999px',
                                fontSize: '0.68rem', fontWeight: 800, minWidth: 16, height: 16, padding: '0 4px',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                            }}>{activeFilterCount}</span>
                        )}
                    </button>

                    <ColumnVisibilityPopover
                        cols={cols}
                        hiddenColumnKeys={hiddenColumnKeys}
                        toggleColumnVisibility={toggleColumnVisibility}
                        handleShowAllColumns={handleShowAllColumns}
                        handleHideAllColumns={handleHideAllColumns}
                        showColVisibility={showColVisibility}
                        setShowColVisibility={setShowColVisibility}
                        align="left"
                        title="Visible Columns"
                    />

                    <button className="btn btn-secondary" onClick={() => {
                        const initialForm = {};
                        cols.forEach(c => {
                            if (c.key !== '_actions') {
                                initialForm[c.key] = '';
                            }
                        });
                        setNewCandidateForm(initialForm);
                        setShowAddCandidate(true);
                    }} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                        <span style={{ fontWeight: 900 }}>+</span> Add Candidate
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowAddCol(true)} style={{ gap: 6, color: 'var(--gold)', borderColor: 'rgba(var(--gold-rgb), 0.3)' }}>
                        <span style={{ fontWeight: 900 }}>+</span> Add Column
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ gap: 6 }}
                        onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, activeCols.filter(c => c.key !== '_actions')), 'all_candidates_details.xlsx')}
                    >
                        <Download size={14} /> Download Excel
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => { load(); loadCols(); }}
                        style={{ gap: 6 }}
                        disabled={loadingCandidates}
                        aria-busy={loadingCandidates}
                    >
                        {/* S4.9: label used to swap to "Refreshing..." alongside the
                            spinning icon - two simultaneous progress signals, and the
                            button's width jumped every click. The icon alone is enough. */}
                        <RefreshCw size={14} className={loadingCandidates ? 'spin' : ''} /> Refresh
                    </button>

                </div>
            </div>

            {candidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                    <FileText size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <p>No candidates yet. Upload resumes to get started.</p>
                </div>
            ) : (
                <>
                    {selectedIds.size > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 18px', borderRadius: 10,
                            background: 'var(--danger-bg)',
                            border: '1px solid rgba(var(--red-rgb), 0.35)',
                            marginBottom: 4,
                            animation: 'fadeIn 0.2s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CheckSquare size={18} style={{ color: 'var(--gold)' }} />
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
                                    {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''} selected
                                </span>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--text-dim)',
                                        cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline'
                                    }}
                                >Clear</button>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {/* S4.6: bulk selection previously had only one action
                                    (delete) - the other operation a recruiter actually
                                    does at volume with a selection is exporting it. */}
                                <button
                                    onClick={() => exportToExcel(
                                        formatCandidatesForExcel(filteredCandidates.filter(c => selectedIds.has(c.id)), activeCols.filter(c => c.key !== '_actions')),
                                        'selected_candidates.xlsx'
                                    )}
                                    className="btn btn-secondary"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700,
                                        borderRadius: 8
                                    }}
                                >
                                    <Download size={16} /> Export Selected
                                </button>
                                <button
                                    onClick={bulkDelete}
                                    className="btn btn-danger"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700,
                                        borderRadius: 8
                                    }}
                                >
                                    <Trash2 size={16} /> Delete Selected ({selectedIds.size})
                                </button>
                            </div>
                        </div>
                    )}

                    <DataTable
                        activeCols={activeCols}
                        leadingColumns={leadingColumns}
                        TH={TH}
                        TD_BASE={TD_BASE}
                        getTableWidth={getTableWidth}
                        draggedColKey={draggedColKey}
                        dragOverColKey={dragOverColKey}
                        handleDragStart={handleDragStart}
                        handleDragOver={handleDragOver}
                        handleDragEnter={handleDragEnter}
                        handleDragEnd={handleDragEnd}
                        handleDrop={handleDrop}
                        clearDragOver={clearDragOver}
                        columnFilters={columnFilters}
                        setColumnFilters={setColumnFilters}
                        onDeleteColumn={handleDeleteCol}
                        toggleColumnVisibility={toggleColumnVisibility}
                        confirm={confirm}
                        tableScrollRef={tableScrollRef}
                        rowVirtualizer={rowVirtualizer}
                        rows={filteredCandidates}
                        renderRow={renderRow}
                        noMatchMessage={loadingCandidates ? (
                            // Was unconditional on rows.length===0 alone, so this
                            // showed as a false "no results" message on every
                            // first-visit-this-session load (candidates starts
                            // empty until the fetch resolves) before silently
                            // getting swapped for the real rows - read as the
                            // page being broken rather than still loading.
                            <>
                                <RefreshCw size={24} className="spin" style={{ marginBottom: 8, opacity: 0.6 }} />
                                <p style={{ margin: 0 }}>Loading candidates…</p>
                            </>
                        ) : (
                            <>
                                <Search size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
                                <p style={{ margin: 0 }}>No candidates match the applied filters.</p>
                            </>
                        )}
                    />

                    {/* Pagination: /api/candidates now returns a bounded page instead of
                        every candidate. "Load More" fetches the next page and appends it
                        -- filters/search only apply to what's loaded so far, matching the
                        page's original "load everything, filter client-side" behavior for
                        anyone who never has more than one page's worth of candidates. */}
                    {typeof totalCandidates === 'number' && candidates.length < totalCandidates && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 0 4px' }}>
                            {/* S4.4: filters/search only ever apply to the candidates
                                already loaded into `candidates`, so once a second page
                                exists a filtered result silently reads as "everything
                                matching" when it's really "everything matching among
                                what's loaded so far". Say that explicitly rather than
                                let it look like a complete result.
                                Deliberately broader than the Filter button's own badge
                                (activeFilterCount, modal filters only): this notice also
                                covers the inline per-column filter row, since either one
                                subsets the loaded rows the same way. */}
                            {(activeFilterCount > 0 || Object.values(columnFilters).some(Boolean)) && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--warning-fg)', textAlign: 'center' }}>
                                    Filters only search the {candidates.length.toLocaleString()} candidates loaded so far, not all {totalCandidates.toLocaleString()} — load more to search everyone.
                                </p>
                            )}
                            <button
                                className="btn btn-secondary"
                                onClick={loadMore}
                                disabled={loadingMore}
                                style={{ color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}
                            >
                                {loadingMore ? 'Loading…' : `Load More (${candidates.length} of ${totalCandidates})`}
                            </button>
                        </div>
                    )}

                    <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click, or focus a cell and press Enter, to edit
                    </p>
                </>
            )}

            {showAddCandidate && (
                <div className="modal-overlay" style={{ zIndex: 999 }} onClick={() => setShowAddCandidate(false)}>
                    <div ref={addCandidateModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="add-candidate-manual-title" onClick={e => e.stopPropagation()} style={{ width: 550, maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                            <h3 id="add-candidate-manual-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Candidate Manually</h3>
                            <button onClick={() => setShowAddCandidate(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 5, display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 15 }}>
                            {cols.filter(c => c.key !== '_actions' && c.key !== 'source').map(c => (
                                <div key={c.key}>
                                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                                        {c.label} {c.key === 'full_name' ? '*' : ''}
                                    </label>
                                    {c.key === 'candidate_status' ? (
                                        <select
                                            value={newCandidateForm[c.key] || 'New'}
                                            onChange={e => setNewCandidateForm(p => ({ ...p, [c.key]: e.target.value }))}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        >
                                            <option value="New">New</option>
                                            <option value="Screening">Screening</option>
                                            <option value="Interview">Interview</option>
                                            <option value="Offered">Offered</option>
                                            <option value="Rejected">Rejected</option>
                                        </select>
                                    ) : (
                                        <input
                                            value={newCandidateForm[c.key] || ''}
                                            onChange={e => setNewCandidateForm(p => ({ ...p, [c.key]: e.target.value }))}
                                            placeholder={`Enter ${c.label}`}
                                            type={c.key.includes('experience') || c.key.includes('exp') ? 'number' : 'text'}
                                            step={c.key.includes('experience') || c.key.includes('exp') ? '0.1' : undefined}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 15 }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddCandidate(false)} style={{ flex: 1 }}>
                                Cancel
                            </button>
                            <button
                                className="btn"
                                onClick={handleAddCandidateSubmit}
                                disabled={isAddingCandidate}
                                style={{ flex: 1, background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: 'bold', opacity: isAddingCandidate ? 0.6 : 1, cursor: isAddingCandidate ? 'not-allowed' : 'pointer' }}
                            >
                                {isAddingCandidate ? 'Adding…' : 'Add Candidate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddCol && (
                <div className="modal-overlay" onClick={() => setShowAddCol(false)}>
                    <div ref={addColModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="add-column-modal-title" onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 id="add-column-modal-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Custom Column</h3>
                            <button onClick={() => setShowAddCol(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Column Name / Label</label>
                                <input
                                    autoFocus
                                    value={newColForm.label} onChange={e => setNewColForm(p => ({ ...p, label: e.target.value }))}
                                    placeholder="e.g. Current Location"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Description / AI Instructions</label>
                                <textarea
                                    value={newColForm.desc} onChange={e => setNewColForm(p => ({ ...p, desc: e.target.value }))}
                                    placeholder="e.g. City and State where candidate is located"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', minHeight: 80, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                            <button className="btn" onClick={handleAddCol} style={{ background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: 'bold' }}>
                                Create Column
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
