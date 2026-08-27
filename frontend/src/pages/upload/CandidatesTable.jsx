import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Trash2, FileText, Filter, Download, RefreshCw, Eye, X, CheckSquare, Users, Search } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../../utils/excelUtils'
import apiClient from '../../api/client'
import ExpandableCell from '../../components/shared/ExpandableCell'

// Extracted from UploadPage.jsx: the "Table" card — header toolbar (Filter
// button, Columns visibility popover, Add Candidate, Add Column, Download
// Excel, Refresh), the bulk-selection banner, the candidates spreadsheet
// itself (draggable/reorderable + hideable column headers, per-column filter
// row, inline cell editing, per-row actions column), plus the two small
// modals it opens directly (Add Candidate, Add Custom Column). Purely
// presentational — the useColumnConfig/useDraggableColumns hooks themselves
// are still called in UploadPage (their outputs are passed down here as
// props), and every piece of state/handler is owned by UploadPage.
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
    setSelectedCandidateForDetails,
    del,
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
    const tableScrollRef = useRef(null)
    const rowVirtualizer = useVirtualizer({
        count: filteredCandidates.length,
        getScrollElement: () => tableScrollRef.current,
        estimateSize: () => 44,
        overscan: 8,
        measureElement: (el) => el.getBoundingClientRect().height,
    })

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
            <div className="section-header" style={{ borderBottom: '1px solid rgba(var(--sky-rgb), 0.2)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="section-title"><Users size={18} /> Candidate Profiles</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start', marginTop: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => setShowFilter(true)} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                        <Filter size={14} /> Filter
                    </button>

                    {/* Columns Selector Popover */}
                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowColVisibility(!showColVisibility)}
                            style={{ gap: 6, color: 'var(--text)', borderColor: 'var(--border)' }}
                        >
                            <Eye size={14} /> Columns
                        </button>

                        {showColVisibility && (
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    position: 'absolute', top: '100%', left: 0, marginTop: '8px', zIndex: 100,
                                    background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.35)', padding: '12px', width: '250px',
                                    display: 'flex', flexDirection: 'column', gap: '10px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--gold)' }}>Visible Columns</span>
                                    <button
                                        onClick={() => setShowColVisibility(false)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                                        title="Close Column Settings"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                    <button
                                        onClick={handleShowAllColumns}
                                        style={{
                                            flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                            border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer'
                                        }}
                                    >
                                        Show All
                                    </button>
                                    <button
                                        onClick={handleHideAllColumns}
                                        style={{
                                            flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                            border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer'
                                        }}
                                    >
                                        Hide All
                                    </button>
                                </div>

                                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {cols.filter(c => c.key !== '_actions').map(c => {
                                        const isChecked = !hiddenColumnKeys.includes(c.key);
                                        return (
                                            <label
                                                key={c.key}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem',
                                                    color: isChecked ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer',
                                                    padding: '4px 6px', borderRadius: '4px', transition: 'all 0.15s',
                                                    background: isChecked ? 'transparent' : 'rgba(var(--sky-rgb), 0.02)'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleColumnVisibility(c.key)}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

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
                    >
                        <RefreshCw size={14} className={loadingCandidates ? 'spin' : ''} /> {loadingCandidates ? 'Refreshing...' : 'Refresh'}
                    </button>

                </div>
            </div>

            {candidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
                    <p>No candidates yet. Upload resumes to get started.</p>
                </div>
            ) : (
                <>
                    {selectedIds.size > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 18px', borderRadius: 10,
                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.06))',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
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
                    )}
                    <div ref={tableScrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
                        <table style={{ width: getTableWidth(), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <colgroup>
                                <col style={{ width: '45px' }} />
                                <col style={{ width: '60px' }} />
                                {activeCols.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style={{
                                        ...TH,
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12,
                                        width: '45px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        userSelect: 'none'
                                    }} onClick={toggleSelectAll} title={selectedIds.size === filteredCandidates.length ? 'Deselect all' : 'Select all'}>
                                        <input
                                            type="checkbox"
                                            checked={filteredCandidates.length > 0 && selectedIds.size === filteredCandidates.length}
                                            onChange={toggleSelectAll}
                                            ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredCandidates.length }}
                                            style={{ cursor: 'pointer', accentColor: 'var(--gold)', width: 15, height: 15 }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </th>
                                    <th style={{
                                        ...TH,
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12,
                                        width: '60px',
                                        textAlign: 'center'
                                    }}>
                                        S.No
                                    </th>
                                    {activeCols.map(c => {
                                        const isActions = c.key === '_actions';
                                        const isDragged = draggedColKey === c.key;
                                        const isDragTarget = dragOverColKey === c.key;

                                        // Harmonic highlight background and dashed border for drag targets
                                        let backgroundStyle = isActions ? 'var(--table-header-bg)' : TH.background;
                                        if (isDragTarget && !isDragged) {
                                            backgroundStyle = 'rgba(var(--gold-rgb), 0.18)';
                                        }

                                        return (
                                            <th
                                                key={c.key}
                                                draggable={!isActions}
                                                onDragStart={(e) => !isActions && handleDragStart(e, c.key)}
                                                onDragOver={(e) => !isActions && handleDragOver(e, c.key)}
                                                onDragEnter={(e) => !isActions && handleDragEnter(e, c.key)}
                                                /* useDraggableColumns doesn't expose a raw dragOverColKey setter,
                                                   so we clear it through the hook's own public handleDragEnter
                                                   (passing key=null instead of '_actions' skips its early-return
                                                   and just calls its internal setDragOverColKey(null)) — same
                                                   end effect as the original inline setDragOverColKey(null). */
                                                onDragLeave={() => !isActions && clearDragOver()}
                                                onDragEnd={() => !isActions && handleDragEnd()}
                                                onDrop={(e) => !isActions && handleDrop(e, c.key)}
                                                style={{
                                                    ...TH,
                                                    position: 'sticky',
                                                    top: 0,
                                                    right: isActions ? 0 : undefined,
                                                    zIndex: isActions ? 15 : 12,
                                                    background: backgroundStyle,
                                                    boxShadow: isActions ? '-3px 0 6px rgba(0,0,0,0.15)' : undefined,
                                                    cursor: isActions ? 'default' : (isDragged ? 'grabbing' : 'grab'),
                                                    opacity: isDragged ? 0.4 : 1,
                                                    borderLeft: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                    borderRight: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                    transition: 'all 0.2s ease-in-out'
                                                }}
                                                title={isActions ? c.label : `${c.label} (Drag to reorder)`}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                                                    {!isActions && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                                            {c.isCustom ? (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleDeleteCol(c.key, c.label);
                                                                    }}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: 'var(--danger-fg)',
                                                                        cursor: 'pointer',
                                                                        padding: '2px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        transition: 'transform 0.15s, color 0.15s',
                                                                        opacity: 0.7,
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.7; }}
                                                                    title="Delete Column"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        if (window.confirm(`Are you sure you want to delete the "${c.label}" column?`)) {
                                                                            toggleColumnVisibility(c.key);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: 'var(--text-dim)',
                                                                        cursor: 'pointer',
                                                                        padding: '2px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        transition: 'transform 0.15s, color 0.15s',
                                                                        opacity: 0.5,
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--gold)'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-dim)'; }}
                                                                    title="Hide Column"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                                <tr style={{ background: 'rgba(var(--navy-dark-rgb), 0.5)' }}>
                                    <th
                                        key="filter-checkbox"
                                        style={{
                                            padding: '6px 10px',
                                            borderBottom: '2px solid var(--border)',
                                            background: 'rgba(var(--navy-rgb), 0.97)',
                                            position: 'sticky',
                                            top: '38px',
                                            zIndex: 11,
                                            textAlign: 'center',
                                        }}
                                    >
                                    </th>
                                    <th
                                        key="filter-s_no"
                                        style={{
                                            padding: '6px 10px',
                                            borderBottom: '2px solid var(--border)',
                                            background: 'rgba(var(--navy-rgb), 0.97)',
                                            position: 'sticky',
                                            top: '38px',
                                            zIndex: 11,
                                            textAlign: 'center',
                                            color: 'var(--gold)',
                                            fontSize: '0.75rem',
                                            fontWeight: 800
                                        }}
                                    >
                                        #
                                    </th>
                                    {activeCols.map(c => {
                                        const isActions = c.key === '_actions';
                                        if (isActions) {
                                            const hasAnyFilter = Object.values(columnFilters).some(v => v);
                                            return (
                                                <th
                                                    key="filter-_actions"
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderBottom: '2px solid var(--border)',
                                                        position: 'sticky',
                                                        top: '38px',
                                                        right: 0,
                                                        zIndex: 14,
                                                        background: 'rgba(var(--navy-dark-rgb), 0.95)',
                                                        boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    {hasAnyFilter && (
                                                        <button
                                                            onClick={() => setColumnFilters({})}
                                                            style={{
                                                                background: 'var(--danger-bg)',
                                                                border: '1px solid rgba(var(--red-rgb), 0.4)',
                                                                borderRadius: '4px',
                                                                color: 'var(--danger-fg)',
                                                                cursor: 'pointer',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 'bold',
                                                                padding: '4px 8px',
                                                                width: '100%',
                                                                transition: 'all 0.2s',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="Clear all column filters"
                                                        >
                                                            <X size={10} /> Clear
                                                        </button>
                                                    )}
                                                </th>
                                            );
                                        }

                                        return (
                                            <th
                                                key={`filter-${c.key}`}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderBottom: '2px solid var(--border)',
                                                    background: 'rgba(var(--navy-rgb), 0.97)',
                                                    position: 'sticky',
                                                    top: '38px',
                                                    zIndex: 11,
                                                }}
                                            >
                                                <input
                                                    type="text"
                                                    value={columnFilters[c.key] || ''}
                                                    onChange={e => setColumnFilters(prev => ({
                                                        ...prev,
                                                        [c.key]: e.target.value
                                                    }))}
                                                    placeholder="Search..."
                                                    style={{
                                                        width: '100%',
                                                        padding: '5px 8px',
                                                        borderRadius: '5px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--input-bg)',
                                                        color: 'var(--text)',
                                                        fontSize: '0.75rem',
                                                        outline: 'none',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onFocus={e => {
                                                        e.target.style.border = '1px solid var(--gold)';
                                                        e.target.style.boxShadow = '0 0 4px rgba(var(--gold-rgb), 0.3)';
                                                    }}
                                                    onBlur={e => {
                                                        e.target.style.border = '1px solid rgba(var(--sky-rgb), 0.25)';
                                                        e.target.style.boxShadow = 'none';
                                                    }}
                                                />
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCandidates.length === 0 ? (
                                    <tr>
                                        <td colSpan={activeCols.length + 2} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                            <Search size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
                                            <p style={{ margin: 0 }}>No candidates match the applied filters.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    <>
                                    {rowVirtualizer.getVirtualItems().length > 0 && (
                                        <tr aria-hidden="true">
                                            <td colSpan={activeCols.length + 2} style={{ padding: 0, border: 'none', height: rowVirtualizer.getVirtualItems()[0].start }} />
                                        </tr>
                                    )}
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const row = filteredCandidates[virtualRow.index]
                                    const ri = virtualRow.index
                                    return (
                                    <tr key={row.id || ri}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        style={{ background: ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.07)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent'}
                                    >
                                        <td style={{
                                            ...TD_BASE,
                                            textAlign: 'center',
                                            padding: '10px 6px'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(row.id)}
                                                onChange={() => toggleSelectCandidate(row.id)}
                                                style={{ cursor: 'pointer', accentColor: 'var(--gold)', width: 15, height: 15 }}
                                            />
                                        </td>
                                        <td style={{
                                            ...TD_BASE,
                                            textAlign: 'center',
                                            fontWeight: 800,
                                            color: 'var(--gold)',
                                            borderRight: '1px solid rgba(var(--sky-rgb), 0.07)'
                                        }}>
                                            {ri + 1}
                                        </td>
                                        {activeCols.map(({ key }) => {
                                            /* ── Actions column ── */
                                            if (key === '_actions') return (
                                                <td
                                                    key={key}
                                                    style={{
                                                        ...TD_BASE,
                                                        textAlign: 'center',
                                                        position: 'sticky',
                                                        right: 0,
                                                        zIndex: 10,
                                                        background: ri % 2 === 0 ? 'var(--input-bg)' : 'var(--card-bg)',
                                                        boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                        overflow: 'visible'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                        <button
                                                            className="btn btn-danger"
                                                            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}
                                                            onClick={() => del(row.id)}
                                                            title="Delete Candidate"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            )

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
                                            if (isExpandable) return (
                                                <td key={key} style={{ ...TD_BASE }} onDoubleClick={() => startEdit(ri, key, val)}>
                                                    <ExpandableCell value={val} onEdit={() => startEdit(ri, key, val)} />
                                                </td>
                                            )

                                            /* ── Regular cells ── */
                                            let display;
                                            if (key === 'candidate_status') {
                                                 const s = String(val || 'New').trim();
                                                 const statusClass = 'status-' + s.toLowerCase().replace(/\s+/g, '-');
                                                 display = (
                                                     <span className={`status-chip ${statusClass}`}>
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
                                            return (
                                                <td key={key} onClick={() => {
                                                         if (key === 'candidate_status') startEdit(ri, key, val);
                                                     }}
                                                     onDoubleClick={() => {
                                                         if (key !== 'candidate_status') startEdit(ri, key, val);
                                                     }} style={{
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
                                                        <span
                                                            onClick={() => setSelectedCandidateForDetails(row)}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                color: 'var(--gold)',
                                                                textDecoration: 'underline',
                                                                cursor: 'pointer',
                                                                fontWeight: 700,
                                                                transition: 'color 0.2s'
                                                            }}
                                                            title="View Candidate Details"
                                                        >
                                                            <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                                            {display}
                                                        </span>
                                                    ) : display}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                    )})}
                                    {rowVirtualizer.getVirtualItems().length > 0 && (
                                        <tr aria-hidden="true">
                                            <td colSpan={activeCols.length + 2} style={{
                                                padding: 0, border: 'none',
                                                height: rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end,
                                            }} />
                                        </tr>
                                    )}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination: /api/candidates now returns a bounded page instead of
                        every candidate. "Load More" fetches the next page and appends it
                        -- filters/search only apply to what's loaded so far, matching the
                        page's original "load everything, filter client-side" behavior for
                        anyone who never has more than one page's worth of candidates. */}
                    {typeof totalCandidates === 'number' && candidates.length < totalCandidates && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 0 4px' }}>
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

                    <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.38)' }}>
                        💡 Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click any cell to edit
                    </p>
                </>
            )}

            {showAddCandidate && (
                <div className="modal-overlay" style={{ zIndex: 999 }}>
                    <div className="card" style={{ width: 550, maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Candidate Manually</h3>
                            <button onClick={() => setShowAddCandidate(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
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
                <div className="modal-overlay">
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Custom Column</h3>
                            <button onClick={() => setShowAddCol(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
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
