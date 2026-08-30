import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Filter } from 'lucide-react'

// Shared table chrome extracted from upload/CandidatesTable.jsx and
// jobs/CandidatesTable.jsx: the sticky draggable/hideable column header row,
// the sticky per-column filter row, and the virtualized <tbody> spacer-row
// pattern. The two tables were near-identical here; everywhere they genuinely
// differ (the actions column, the full_name cell's extra checkbox/badge, the
// inline-edit blur timing) stays owned by the caller via `renderRow` and
// `leadingColumns` rather than being forced into a one-size-fits-all cell
// renderer.
//
// `leadingColumns`: columns that exist outside the normal `activeCols` set
// (upload's bulk-select checkbox + S.No columns). Each entry only supplies
// the header/filter-row content — the actual per-row <td> for a leading
// column is rendered by the caller's own `renderRow`, same as every other
// column, so a table's whole row markup lives in one place.
//
// `onDeleteColumn` is optional: when omitted, a column's header action is
// always "hide" (matching jobs/CandidatesTable.jsx, which never allowed
// column deletion). When provided, a custom column (`col.isCustom`) gets a
// delete button instead, matching upload/CandidatesTable.jsx.
export default function DataTable({
    activeCols,
    leadingColumns = [],
    TH,
    TD_BASE,
    getTableWidth,
    draggedColKey,
    dragOverColKey,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragEnd,
    handleDrop,
    clearDragOver,
    columnFilters,
    setColumnFilters,
    onDeleteColumn,
    toggleColumnVisibility,
    confirm,
    tableScrollRef,
    rowVirtualizer,
    rows,
    renderRow,
    noMatchMessage,
    tbodyRef,
    ariaRowCount,
    fillHeight = false,
}) {
    const colSpan = activeCols.length + leadingColumns.length
    const virtualItems = rowVirtualizer.getVirtualItems()

    // Was an always-rendered second header row - an empty "Search..." box
    // under every single column, all the time, whether or not anyone wanted
    // to filter that column. Modern data tables (Notion, Linear, Airtable)
    // keep per-column filtering but put it behind a toggle so the grid
    // isn't permanently doubled in header height for a feature most visits
    // never use. Nothing is removed - same inputs, same columnFilters state,
    // same "Clear all" - just collapsed by default with a discoverable
    // toggle + active-count badge instead of always-on.
    const [showFilters, setShowFilters] = useState(false)
    const activeFilterCount = Object.values(columnFilters).filter(Boolean).length

    // The filter row's sticky `top` used to be a hardcoded 38px, but the
    // header row above it is 11px padding + ~11.7px uppercase text + 2px
    // border ~= 42px tall - while scrolled, the filter row overlapped the
    // header by ~4px and its inputs clipped. Measuring the real header
    // height means this stays correct if TH's padding/font-size ever
    // changes, instead of silently desyncing again.
    const headerRowRef = useRef(null)
    const [headerHeight, setHeaderHeight] = useState(40)
    useEffect(() => {
        const el = headerRowRef.current
        if (!el) return
        const measure = () => setHeaderHeight(el.getBoundingClientRect().height)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    // scrollbarGutter:'stable' reserves the vertical scrollbar's track width
    // up front instead of only when content overflows, so the sticky
    // right:0 Actions column's declared width doesn't get eaten by the
    // scrollbar appearing on top of it (the actual cause of the Actions
    // column looking "fixed and overlapping").
    // fillHeight: the table becomes the page's only vertical scroller instead
    // of nesting its own scroll inside a page that also scrolls (a page has
    // to actually be a fixed-height flex column above this for flex:1 to mean
    // anything - see upload/CandidatesTable.jsx). Off by default so callers
    // that still rely on natural document scroll (jobs/CandidatesTable.jsx,
    // nested under JobDetailPanel's own scroll) are unaffected.
    return (
        <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, flexShrink: 0 }}>
            <button
                type="button"
                onClick={() => setShowFilters(v => !v)}
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: 'var(--fs-2)', gap: 6, color: showFilters ? 'var(--gold)' : undefined, borderColor: showFilters ? 'var(--border-gold)' : undefined }}
                title={showFilters ? 'Hide per-column search' : 'Search within columns'}
                aria-pressed={showFilters}
            >
                <Filter size={13} />
                Column filters
                {activeFilterCount > 0 && (
                    <span style={{ background: 'var(--gold)', color: 'var(--action-fg)', borderRadius: 999, fontSize: 'var(--fs-1)', fontWeight: 800, minWidth: 16, height: 16, padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        {activeFilterCount}
                    </span>
                )}
            </button>
        </div>
        <div ref={tableScrollRef} style={fillHeight
            // minHeight is a floor, not 0: on a short viewport where the rest of
            // the page (dropzone, toolbar) already eats most of the available
            // height, the table still needs room to be usable rather than
            // collapsing to nothing - when that floor doesn't fit, the page's
            // own scroll (.page-body) takes back over, same as before this
            // page ever had a fillHeight table.
            ? { overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 320, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', width: '100%', scrollbarGutter: 'stable' }
            : { overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', width: '100%', scrollbarGutter: 'stable' }
        }>
            <table
                role={ariaRowCount != null ? 'grid' : undefined}
                aria-rowcount={ariaRowCount}
                style={{ width: getTableWidth(), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 'var(--fs-3)' }}
            >
                <colgroup>
                    {leadingColumns.map(lc => <col key={lc.key} style={{ width: lc.width }} />)}
                    {activeCols.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                </colgroup>
                <thead>
                    <tr ref={headerRowRef}>
                        {leadingColumns.map(lc => (
                            <th key={lc.key} style={{
                                ...TH, position: 'sticky', top: 0, zIndex: 12,
                                width: lc.width, textAlign: lc.align || 'left',
                                cursor: lc.headerCursor, userSelect: lc.headerCursor ? 'none' : undefined,
                            }} onClick={lc.onHeaderClick} title={lc.headerTitle}>
                                {lc.renderHeader ? lc.renderHeader() : null}
                            </th>
                        ))}
                        {activeCols.map(c => {
                            const isActions = c.key === '_actions';
                            const isDragged = draggedColKey === c.key;
                            const isDragTarget = dragOverColKey === c.key;

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
                                    onDragLeave={() => !isActions && clearDragOver()}
                                    onDragEnd={() => !isActions && handleDragEnd()}
                                    onDrop={(e) => !isActions && handleDrop(e, c.key)}
                                    style={{
                                        ...TH,
                                        // isActions used to also get position:sticky;right:0 here
                                        // (and in the filter-row <th> and renderRow's <td> below) -
                                        // see jobs/CandidatesTable.jsx's Actions cell comment for
                                        // why that read as "randomly overlapping" rather than
                                        // living at a clean fixed edge. Vertical stickiness (top:0,
                                        // same as every other header) is unrelated and kept.
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12,
                                        background: backgroundStyle,
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
                                                {onDeleteColumn && c.isCustom ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            onDeleteColumn(c.key, c.label);
                                                        }}
                                                        style={{
                                                            background: 'none', border: 'none', color: 'var(--danger-fg)',
                                                            cursor: 'pointer', padding: '2px', display: 'inline-flex',
                                                            alignItems: 'center', transition: 'transform 0.15s, color 0.15s', opacity: 0.7,
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.7; }}
                                                        title="Delete Column"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (await confirm({ title: 'Hide column?', message: `Hide the "${c.label}" column? You can show it again from Columns.`, confirmLabel: 'Hide', danger: false })) {
                                                                toggleColumnVisibility(c.key);
                                                            }
                                                        }}
                                                        style={{
                                                            background: 'none', border: 'none', color: 'var(--text-dim)',
                                                            cursor: 'pointer', padding: '2px', display: 'inline-flex',
                                                            alignItems: 'center', transition: 'transform 0.15s, color 0.15s', opacity: 0.5,
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
                    {showFilters && (
                    <tr style={{ background: 'rgba(var(--navy-dark-rgb), 0.5)' }}>
                        {leadingColumns.map(lc => (
                            <th key={`filter-${lc.key}`} style={{
                                padding: '6px 10px', borderBottom: '2px solid var(--border)',
                                background: 'rgba(var(--navy-rgb), 0.97)', position: 'sticky', top: headerHeight,
                                zIndex: 11, textAlign: lc.align || 'left',
                                color: lc.filterCellColor, fontSize: lc.filterCellColor ? '0.75rem' : undefined,
                                fontWeight: lc.filterCellColor ? 800 : undefined,
                            }}>
                                {lc.renderFilterCell ? lc.renderFilterCell() : null}
                            </th>
                        ))}
                        {activeCols.map(c => {
                            const isActions = c.key === '_actions';
                            if (isActions) {
                                const hasAnyFilter = Object.values(columnFilters).some(v => v);
                                return (
                                    <th
                                        key="filter-_actions"
                                        style={{
                                            padding: '6px 10px', borderBottom: '2px solid var(--border)',
                                            position: 'sticky', top: headerHeight, zIndex: 11,
                                            background: 'rgba(var(--navy-rgb), 0.97)', textAlign: 'center'
                                        }}
                                    >
                                        {hasAnyFilter && (
                                            <button
                                                onClick={() => setColumnFilters({})}
                                                style={{
                                                    background: 'var(--danger-bg)', border: '1px solid rgba(var(--red-rgb), 0.4)',
                                                    borderRadius: '4px', color: 'var(--danger-fg)', cursor: 'pointer',
                                                    fontSize: 'var(--fs-1)', fontWeight: 'bold', padding: '4px 8px', width: '100%',
                                                    transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center',
                                                    justifyContent: 'center', gap: '4px'
                                                }}
                                                title="Clear all column filters"
                                            >
                                                <X size={12} /> Clear
                                            </button>
                                        )}
                                    </th>
                                );
                            }

                            return (
                                <th
                                    key={`filter-${c.key}`}
                                    style={{
                                        padding: '6px 10px', borderBottom: '2px solid var(--border)',
                                        background: 'rgba(var(--navy-rgb), 0.97)', position: 'sticky', top: headerHeight, zIndex: 11,
                                    }}
                                >
                                    {/* Was onFocus/onBlur inline handlers restoring a DIFFERENT
                                        color on blur (rgba(--sky-rgb,0.25)) than the field started
                                        with (var(--border)) - focus any filter once and that
                                        column's input stayed visibly blue-bordered for the rest of
                                        the session. A CSS class expresses "return to the resting
                                        state" correctly by construction. */}
                                    <input
                                        type="text"
                                        className="column-filter-input"
                                        value={columnFilters[c.key] || ''}
                                        onChange={e => setColumnFilters(prev => ({ ...prev, [c.key]: e.target.value }))}
                                        placeholder="Search..."
                                    />
                                </th>
                            );
                        })}
                    </tr>
                    )}
                </thead>
                <tbody ref={tbodyRef}>
                    {rows.length === 0 && noMatchMessage ? (
                        <tr>
                            <td colSpan={colSpan} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                {noMatchMessage}
                            </td>
                        </tr>
                    ) : (
                        <>
                            {virtualItems.length > 0 && (
                                <tr aria-hidden="true">
                                    <td colSpan={colSpan} style={{ padding: 0, border: 'none', height: virtualItems[0].start }} />
                                </tr>
                            )}
                            {virtualItems.map((virtualRow) => renderRow(rows[virtualRow.index], virtualRow.index, virtualRow, rowVirtualizer))}
                            {virtualItems.length > 0 && (
                                <tr aria-hidden="true">
                                    <td colSpan={colSpan} style={{
                                        padding: 0, border: 'none',
                                        height: rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end,
                                    }} />
                                </tr>
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </div>
        </>
    )
}
