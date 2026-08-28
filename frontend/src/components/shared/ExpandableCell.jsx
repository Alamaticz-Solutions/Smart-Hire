import { useState, useRef } from 'react'
import { X, Edit } from 'lucide-react'
import Chip from './Chip'
import Tag from './Tag'
import { useModalA11y } from '../../hooks/useModalA11y'

/**
 * Collapsible table-cell popup: shows the first comma-separated item inline
 * plus a "+N" pill that expands a modal listing every item, with an "Edit"
 * shortcut back to the caller's full-text editor.
 *
 * Extracted from: JobsPage.jsx (`ExpandableCell`, ~line 27) and
 * UploadPage.jsx (`ExpandableCell`, ~line 25) — the two implementations
 * were identical apart from a couple of comments, so this is a straight
 * dedup with no behavioral reconciliation needed. Both originals already
 * used the shared `.modal-overlay` CSS class (see index.css) for the popup
 * backdrop, which is preserved here.
 */
export default function ExpandableCell({ value, onEdit }) {
    const [open, setOpen] = useState(false)
    const btnRef = useRef(null)
    const modalRef = useModalA11y(open, () => setOpen(false))

    const items = value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []

    const openPopup = (e) => {
        e.stopPropagation()
        setOpen(true)
    }

    if (items.length === 0) return <span style={{ opacity: 0.35 }}>—</span>

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                <Tag style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100% - 64px)' }}>
                    {items[0]}
                </Tag>

                {items.length > 1 && (
                    <Tag
                        as="button"
                        ref={btnRef}
                        type="button"
                        onClick={openPopup}
                        aria-label={`Show ${items.length - 1} more`}
                        tone="gold"
                        style={{ cursor: 'pointer', fontFamily: 'var(--fh)', fontWeight: 700, flexShrink: 0 }}
                    >
                        +{items.length - 1}
                    </Tag>
                )}
            </div>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    className="modal-overlay"
                >
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="expandable-cell-modal-title"
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '16px 20px', width: 340, maxWidth: '90%',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span id="expandable-cell-modal-title" style={{
                                fontSize: '0.78rem', color: 'var(--gold)', fontFamily: 'var(--fh)',
                                fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05rem'
                            }}>
                                All ({items.length})
                            </span>
                            <button onClick={() => setOpen(false)} aria-label="Close"
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                            {items.map((s, i) => <Chip key={i} text={s} />)}
                        </div>

                        <div style={{
                            marginTop: 12, borderTop: '1px solid var(--border)',
                            paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', opacity: 0.7 }}>
                                Double-click cell to edit full text
                            </span>
                            <button onClick={() => { setOpen(false); onEdit() }}
                                style={{
                                    background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                    borderRadius: 6, color: 'var(--gold)', fontSize: '0.75rem', cursor: 'pointer',
                                    padding: '4px 12px', fontFamily: 'var(--fh)', fontWeight: 700,
                                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}>
                                <Edit size={12} /> Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
