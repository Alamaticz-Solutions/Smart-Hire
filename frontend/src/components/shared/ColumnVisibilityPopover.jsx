import { X, Eye, ArrowUp, ArrowDown } from 'lucide-react'

// Shared "Columns" button + popover, extracted from upload/CandidatesTable.jsx
// and jobs/CandidatesTable.jsx — the two were pixel-for-pixel identical except
// for popover alignment (upload: left-anchored under the button; jobs:
// right-anchored) and the title/button layout in the popover header, both
// exposed here as props rather than hardcoded.
//
// `moveColumn(key, dir)` (optional): when provided, each row gets up/down
// controls to reorder that column (dir -1 / +1). This is the ONLY column
// reorder affordance now — drag-to-reorder was removed from the table
// header itself.
export default function ColumnVisibilityPopover({
    cols,
    hiddenColumnKeys,
    toggleColumnVisibility,
    handleShowAllColumns,
    handleHideAllColumns,
    showColVisibility,
    setShowColVisibility,
    moveColumn,
    align = 'left',
    title = 'Visible Columns',
}) {
    const reorderable = cols.filter(c => c.key !== '_actions')
    return (
        <div style={{ position: 'relative' }}>
            <button
                className="btn btn-secondary"
                onClick={() => setShowColVisibility(!showColVisibility)}
                style={{ gap: 6, color: 'var(--text)', borderColor: 'var(--border)' }}
                aria-expanded={showColVisibility}
                aria-haspopup="true"
            >
                <Eye size={14} /> Columns
            </button>

            {showColVisibility && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'absolute', top: '100%', [align]: 0, marginTop: '8px', zIndex: 100,
                        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.35)', padding: '12px', width: '250px',
                        display: 'flex', flexDirection: 'column', gap: '10px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 'var(--fs-4)', color: 'var(--gold)' }}>{title}</span>
                        <button
                            onClick={() => setShowColVisibility(false)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                            aria-label="Close column settings"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                        <button
                            onClick={handleShowAllColumns}
                            style={{
                                flex: 1, padding: '4px 8px', fontSize: 'var(--fs-2)', borderRadius: '4px',
                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer'
                            }}
                        >
                            Show All
                        </button>
                        <button
                            onClick={handleHideAllColumns}
                            style={{
                                flex: 1, padding: '4px 8px', fontSize: 'var(--fs-2)', borderRadius: '4px',
                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer'
                            }}
                        >
                            Hide All
                        </button>
                    </div>

                    {moveColumn && (
                        <p style={{ margin: 0, fontSize: 'var(--fs-1)', color: 'var(--text-subtle)' }}>
                            Use the arrows to reorder columns; the checkbox shows or hides one.
                        </p>
                    )}
                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {reorderable.map((c, i) => {
                            const isChecked = !hiddenColumnKeys.includes(c.key);
                            return (
                                <div
                                    key={c.key}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-3)',
                                        color: isChecked ? 'var(--text)' : 'var(--text-dim)',
                                        padding: '4px 6px', borderRadius: '4px', transition: 'all 0.15s',
                                        background: isChecked ? 'transparent' : 'rgba(var(--sky-rgb), 0.02)'
                                    }}
                                >
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleColumnVisibility(c.key)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.label}</span>
                                    </label>
                                    {moveColumn && (
                                        <span style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                            <button
                                                type="button"
                                                onClick={() => moveColumn(c.key, -1)}
                                                disabled={i === 0}
                                                aria-label={`Move ${c.label} left`}
                                                title="Move left"
                                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: 2, display: 'inline-flex' }}
                                            >
                                                <ArrowUp size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveColumn(c.key, 1)}
                                                disabled={i === reorderable.length - 1}
                                                aria-label={`Move ${c.label} right`}
                                                title="Move right"
                                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: i === reorderable.length - 1 ? 'default' : 'pointer', opacity: i === reorderable.length - 1 ? 0.3 : 1, padding: 2, display: 'inline-flex' }}
                                            >
                                                <ArrowDown size={13} />
                                            </button>
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
