import { X, Eye } from 'lucide-react'

// Shared "Columns" button + popover, extracted from upload/CandidatesTable.jsx
// and jobs/CandidatesTable.jsx — the two were pixel-for-pixel identical except
// for popover alignment (upload: left-anchored under the button; jobs:
// right-anchored) and the title/button layout in the popover header, both
// exposed here as props rather than hardcoded.
export default function ColumnVisibilityPopover({
    cols,
    hiddenColumnKeys,
    toggleColumnVisibility,
    handleShowAllColumns,
    handleHideAllColumns,
    showColVisibility,
    setShowColVisibility,
    align = 'left',
    title = 'Visible Columns',
}) {
    return (
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
                        position: 'absolute', top: '100%', [align]: 0, marginTop: '8px', zIndex: 100,
                        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.35)', padding: '12px', width: '250px',
                        display: 'flex', flexDirection: 'column', gap: '10px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--gold)' }}>{title}</span>
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
    )
}
