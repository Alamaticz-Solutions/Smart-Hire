import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, UserCheck, ChevronRight, Edit, Trash2, Download, FileText, Mail, Star, MoreVertical } from 'lucide-react';
import apiClient from '../../api/client';
import { exportToExcel, formatCandidatesForExcel } from '../../utils/excelUtils';
import ExpandableCell from '../../components/shared/ExpandableCell';
import ColumnVisibilityPopover from '../../components/shared/ColumnVisibilityPopover';
import DataTable from '../../components/shared/DataTable';
import { CANDIDATE_STATUSES } from '../../utils/candidateStatus';

// Extracted from JobsPage.jsx: the Matched/Selected tabs plus the whole
// candidates spreadsheet section (columns selector popover, Excel export,
// draggable/reorderable + hideable column headers, per-column filter row,
// inline cell editing, and the per-row actions column). Purely presentational
// — the useColumnConfig/useDraggableColumns hooks themselves are still called
// in JobsPage (their outputs are simply passed down here as props), and every
// setState/handler is owned by JobsPage.
//
// Row/header chrome is shared with upload/CandidatesTable.jsx via
// <DataTable>/<ColumnVisibilityPopover> (see that file's header comment for
// the extraction rationale). This table has no leadingColumns (no bulk-select
// or S.No here) and passes no `onDeleteColumn`, so DataTable's column-header
// action is always "hide" — this table never supported deleting a column,
// unlike Upload's.
const menuItemStyle = (color) => ({
    width: '100%', padding: '10px 14px', background: 'none', border: 'none',
    color, textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
    display: 'flex', alignItems: 'center', gap: '8px',
})

export default function CandidatesTable({
    isExternal,
    selectedJob,
    activeTab,
    setActiveTab,
    cols,
    showColVisibility,
    setShowColVisibility,
    hiddenColumnKeys,
    toggleColumnVisibility,
    handleShowAllColumns,
    handleHideAllColumns,
    draggedColKey,
    dragOverColKey,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragEnd,
    handleDrop,
    clearDragOver,
    TH,
    TD_BASE,
    columnFilters,
    setColumnFilters,
    activeCols,
    getTableWidth,
    filteredCandidates,
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
    setSelectedCellText,
    handleStatusChange,
    setEditingCandidate,
    setEditName,
    setEditExp,
    setEditSkills,
    setEditReason,
    setEditCurrentLocation,
    setEditPrefLocations,
    handleRemoveFromJob,
    handleDeleteCandidate,
}) {
    // Virtualization, same rationale/pattern as pages/upload/CandidatesTable.jsx:
    // only mount the rows currently in (or near) the scrollable viewport instead
    // of every row in filteredCandidates. This table previously had no internal
    // scroll region at all (it grew with the page); giving it one here (see the
    // `overflowY`/`maxHeight` added to the scroll wrapper below) is a deliberate,
    // approved UX change specifically to make that possible, matching the
    // `maxHeight: '70vh'` pattern Upload's table already used.
    // S5.4: the actions cell used to render up to 6 buttons (Select/Deselect,
    // Send Gmail, Edit, Remove, Delete) at 0.73rem - below the 12px legibility
    // floor and far below a 44px target, three different color treatments.
    // Collapsed to one primary action (context-dependent on the active tab)
    // plus an overflow menu for the rest, reusing the same MoreVertical
    // dropdown pattern JobSidebar.jsx already uses for per-job actions.
    //
    // The menu is portaled to document.body rather than positioned relative
    // to its trigger: this row sits inside DataTable's scrollable wrapper
    // (overflow:auto, for the horizontal/vertical table scroll), which clips
    // any absolutely-positioned descendant that escapes its bounds - an
    // in-flow dropdown here would render invisibly clipped for any row near
    // the table's right/bottom edge. `menuAnchor` carries the trigger
    // button's viewport rect (captured on open) so the portaled menu can
    // position itself with `position: fixed` outside that clipping context.
    const [menuAnchor, setMenuAnchor] = useState(null) // { rowId, top, left } | null

    const tableScrollRef = useRef(null)

    useEffect(() => {
        if (!menuAnchor) return
        const close = () => setMenuAnchor(null)
        const scrollEl = tableScrollRef.current
        scrollEl?.addEventListener('scroll', close)
        window.addEventListener('resize', close)
        return () => {
            scrollEl?.removeEventListener('scroll', close)
            window.removeEventListener('resize', close)
        }
    }, [menuAnchor])

    // filteredCandidates gets a new reference on any background refresh
    // (e.g. JobsPage's match-status poll updating selectedJob/jobs) as well
    // as on user filtering. Since this table is virtualized, a row can
    // remount at a different index between such refreshes while an open
    // menu's captured rect/rowId stay pointed at the old position — close
    // proactively rather than risk a menu anchored to stale coordinates.
    useEffect(() => {
        setMenuAnchor(null)
    }, [filteredCandidates])
    const rowVirtualizer = useVirtualizer({
        count: filteredCandidates.length,
        getScrollElement: () => tableScrollRef.current,
        estimateSize: () => 44,
        overscan: 8,
        measureElement: (el) => el.getBoundingClientRect().height,
    })

    const renderRow = (row, ri, virtualRow) => (
        // See .data-row in index.css - was JS mouse handlers overwriting
        // style.background directly, which made keyboard focus show no
        // row highlight at all.
        <tr key={row.id || ri}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="data-row"
            data-zebra={ri % 2 === 0 ? 'even' : undefined}
        >
            {activeCols.map(({ key }) => {
                /* ── Actions column ── */
                if (key === '_actions') return (
                    // Was position:sticky;right:0 - on a table narrower than
                    // its viewport (any job with few visible columns) the
                    // pinned cell's own opaque background sat on top of
                    // whatever regular column hadn't scrolled out from
                    // under it yet, reading as the Actions column randomly
                    // overlapping mid-table content instead of living at a
                    // fixed right edge. A normal scrolling column doesn't
                    // have that failure mode.
                    <td
                        key={key}
                        style={{
                            ...TD_BASE, textAlign: 'center',
                            overflow: 'visible', verticalAlign: 'middle'
                        }}
                    >
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                            {activeTab === 'matched' ? (
                                <button className="btn btn-primary" onClick={() => handleStatusChange(row.id, 'selected')} style={{ fontSize: '0.78rem', padding: '6px 10px' }} title="Select candidate for job">
                                    Select <ChevronRight size={12} />
                                </button>
                            ) : (
                                <button className="btn btn-secondary" onClick={() => handleStatusChange(row.id, 'matched')} style={{ fontSize: '0.78rem', padding: '6px 10px', borderColor: 'var(--border)' }} title="Remove Selection">
                                    Deselect
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (menuAnchor?.rowId === row.id) { setMenuAnchor(null); return }
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setMenuAnchor({ rowId: row.id, top: r.bottom + 4, left: r.right - 190 });
                                }}
                                aria-label="More actions"
                                aria-haspopup="menu"
                                aria-expanded={menuAnchor?.rowId === row.id}
                                style={{
                                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
                                    cursor: 'pointer', width: 30, height: 30, borderRadius: 'var(--r-md)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}
                            >
                                <MoreVertical size={14} />
                            </button>
                            {menuAnchor?.rowId === row.id && createPortal(
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setMenuAnchor(null)} />
                                    <div
                                        role="menu"
                                        style={{
                                            position: 'fixed', top: menuAnchor.top, left: menuAnchor.left, zIndex: 999, width: 190,
                                            background: 'var(--navy-dark)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.4)', overflow: 'hidden',
                                        }}
                                    >
                                        {activeTab === 'selected' && row.email && (
                                            <button
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuAnchor(null);
                                                    const subject = encodeURIComponent(`Congratulations! You have been selected for ${selectedJob.title} at ${selectedJob.client_name || 'Alamaticz'}`);
                                                    const body = encodeURIComponent(`Dear ${row.full_name},\n\nWe are pleased to inform you that you have been selected for the position of ${selectedJob.title} at ${selectedJob.client_name || 'our company'}.\n\nWe were highly impressed by your experience and credentials.\nOur recruitment team will contact you shortly with the official offer letter and next onboarding steps.\n\nBest regards,\nRecruitment Team\nAlamaticz Solutions`);
                                                    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${row.email}&su=${subject}&body=${body}`;
                                                    window.open(gmailUrl, '_blank');
                                                }}
                                                style={menuItemStyle('var(--sky-dim)')}
                                            >
                                                <Mail size={14} /> Send Gmail
                                            </button>
                                        )}
                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuAnchor(null);
                                                setEditingCandidate(row);
                                                setEditName(row.full_name || row.filename || '');
                                                setEditExp(row.total_experience || '0');
                                                setEditSkills(row.skills || '');
                                                setEditReason(row.ai_reason || '');
                                                setEditCurrentLocation(row.current_location || '');
                                                setEditPrefLocations(row.pref_locations || '');
                                            }}
                                            style={menuItemStyle('var(--gold)')}
                                        >
                                            <Edit size={14} /> Edit details
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => { setMenuAnchor(null); handleRemoveFromJob(row.id) }}
                                            style={menuItemStyle('var(--sky)')}
                                            title="Remove candidate from this job description mapping"
                                        >
                                            Remove from job
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => { setMenuAnchor(null); handleDeleteCandidate(row.id) }}
                                            style={{ ...menuItemStyle('var(--danger-fg)'), borderTop: '1px solid var(--border)' }}
                                            title="Delete candidate permanently from database"
                                        >
                                            <Trash2 size={14} /> Delete candidate
                                        </button>
                                    </div>
                                </>,
                                document.body
                            )}
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
                        const statusOptions = CANDIDATE_STATUSES;
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
                                    // The 200ms delay is load-bearing: onChange above is async
                                    // (PUT + toast), and blurring the <select> unmounts it -
                                    // firing onBlur synchronously here would tear the element
                                    // down mid-request. Upload's identical-looking editor can
                                    // blur immediately because nothing else there races it.
                                    onBlur={() => setTimeout(() => setEditCell(null), 200)}
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

                /* ── Expandable (skills / certs) ── */
                // G-33: ExpandableCell's own "+N" button is already a real,
                // keyboard-reachable control when a cell holds more than one
                // value - but with exactly one value it renders no button at
                // all, leaving double-click on this <td> as the only way in.
                // tabIndex + Enter/Space here covers that single-value case
                // without duplicating a control ExpandableCell already owns.
                if (isExpandable) return (
                    <td
                        key={key}
                        tabIndex={0}
                        style={{ ...TD_BASE, verticalAlign: 'middle' }}
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

                // G-33: double-click opened either the inline editor or the
                // full-text modal with no keyboard equivalent at all, and
                // single-click meant something different only for
                // candidate_status. activateCell folds both mouse gestures
                // into the one action Enter/Space now also triggers, so the
                // interaction model is the same regardless of input device.
                const activateCell = () => {
                    if (key === 'candidate_status') { startEdit(ri, key, val); return }
                    if (key === 'full_name') return // has its own focusable control below
                    const colLabel = cols.find(c => c.key === key)?.label || key;
                    if (String(val).length > 25 || key === 'ai_reason' || key === 'notescomments' || key === 'skills' || key === 'certifications') {
                        setSelectedCellText({ title: colLabel, text: String(val || '') });
                    } else {
                        startEdit(ri, key, val);
                    }
                };
                return (
                    <td
                        key={key}
                        tabIndex={key === 'full_name' ? undefined : 0}
                        onClick={() => { if (key === 'candidate_status') startEdit(ri, key, val) }}
                        onDoubleClick={activateCell}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && key !== 'full_name') { e.preventDefault(); activateCell() } }}
                        style={{
                            ...TD_BASE,
                            color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                            fontWeight: key === 'full_name' ? 700 : undefined,
                            whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                ? 'normal' : 'nowrap',
                            wordBreak: key === 'email' ? 'break-all' : undefined,
                            cursor: key === 'candidate_status' ? 'pointer' : 'text',
                            verticalAlign: 'middle'
                        }}>
                        {key === 'full_name' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={row.job_status === 'selected'}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        handleStatusChange(row.id, row.job_status === 'selected' ? 'matched' : 'selected');
                                    }}
                                    title={row.job_status === 'selected' ? 'Deselect Candidate for Job Role' : 'Select Candidate for Job Role'}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--gold)', flexShrink: 0 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setSelectedCandidateForDetails(row)}
                                    style={{
                                        /* See upload/CandidatesTable.jsx's identical fix: inline-flex +
                                           alignItems:center misaligned icon vs. text once a long name
                                           wrapped to 2 lines within this column. */
                                        display: 'flex', width: '100%', alignItems: 'flex-start', gap: '6px', color: 'var(--gold)',
                                        textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, transition: 'color 0.2s',
                                        background: 'none', border: 'none', padding: 0, font: 'inherit', textAlign: 'left',
                                    }}
                                    title="View Candidate Profile & Jobs"
                                >
                                    <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                    {display}
                                    {row.is_qualified ? (
                                        <span style={{ fontSize: '0.72rem', background: 'rgba(var(--gold-rgb), 0.2)', padding: '2px 6px', borderRadius: '10px', color: 'var(--gold)', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Qualified candidate">
                                            <Star size={11} fill="currentColor" /> Qualified
                                        </span>
                                    ) : null}
                                </button>
                            </div>
                        ) : key === 'email' && val ? (
                            <a
                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${val}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Send email via Gmail"
                                style={{ color: 'var(--sky-dim)', textDecoration: 'underline', cursor: 'pointer' }}
                                onClick={e => e.stopPropagation()}
                            >
                                {display}
                            </a>
                        ) : (
                            display
                        )}
                    </td>
                )
            })}
        </tr>
    )

    return (
        <>
            {!isExternal && (
                /* Tabs */
                <div style={{ padding: '1rem 2rem 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setActiveTab('matched')}
                        style={{
                            padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: `3px solid ${activeTab === 'matched' ? 'var(--gold)' : 'transparent'}`,
                            color: activeTab === 'matched' ? 'var(--gold)' : 'var(--text-dim)', fontWeight: activeTab === 'matched' ? 700 : 500, cursor: 'pointer',
                            fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                        }}
                    >
                        <Search size={16} /> Matched ({selectedJob.matched_count})
                    </button>
                    <button
                        onClick={() => setActiveTab('selected')}
                        style={{
                            padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: `3px solid ${activeTab === 'selected' ? 'var(--primary)' : 'transparent'}`,
                            color: activeTab === 'selected' ? 'var(--primary)' : 'var(--text-dim)', fontWeight: activeTab === 'selected' ? 700 : 500, cursor: 'pointer',
                            fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                        }}
                    >
                        <UserCheck size={16} /> Selected ({selectedJob.selected_count})
                    </button>
                </div>
            )}

            {/* Candidates List Spreadsheet Table */}
            <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                {isExternal && (
                    <h3 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', marginBottom: '1.25rem', fontSize: '1.2rem', fontWeight: 800 }}>
                        Your Application & Match Status
                    </h3>
                )}

                {!isExternal && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: '15px' }}>
                        <ColumnVisibilityPopover
                            cols={cols}
                            hiddenColumnKeys={hiddenColumnKeys}
                            toggleColumnVisibility={toggleColumnVisibility}
                            handleShowAllColumns={handleShowAllColumns}
                            handleHideAllColumns={handleHideAllColumns}
                            showColVisibility={showColVisibility}
                            setShowColVisibility={setShowColVisibility}
                            align="right"
                            title="Columns Visibility"
                        />
                        <button
                            className="btn btn-secondary"
                            style={{ gap: 6, padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, activeCols.filter(c => c.key !== '_actions')), `job_${selectedJob.title.replace(/\s+/g, '_')}_candidates.xlsx`)}
                        >
                            <Download size={14} /> Download Excel
                        </button>
                    </div>
                )}

                {filteredCandidates.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem', padding: '3rem', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                        <Search size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                        <p style={{ margin: 0 }}>
                            {isExternal
                                ? 'None of your submitted candidates have matched this job yet — check back after the recruiting team runs matching.'
                                : (activeTab === 'matched'
                                    ? 'No candidates matched yet. Click “Match Job Description” to score your candidate database against this job.'
                                    : 'No candidates selected yet. Select them from the Matched tab.')}
                        </p>
                    </div>
                ) : (
                    <>
                        <DataTable
                            activeCols={activeCols}
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
                            toggleColumnVisibility={toggleColumnVisibility}
                            confirm={confirm}
                            tableScrollRef={tableScrollRef}
                            rowVirtualizer={rowVirtualizer}
                            rows={filteredCandidates}
                            renderRow={renderRow}
                        />
                        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                            Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click, or focus a cell and press Enter, to edit
                        </p>
                    </>
                )}
            </div>
        </>
    );
}
