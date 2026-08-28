import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

// Replaces window.confirm() (G-3/G-25): a real dialog with focus trap,
// Escape-to-cancel, and focus restoration to the trigger on close (G-39),
// instead of a native modal that blocks the render thread and can't be
// styled, themed, or given a specific "type to confirm" step.
//
// `confirmText` (G-25): when set, the confirm button stays disabled until
// the viewer types this exact string into the field that appears below the
// message - for the small set of destructive actions (delete user, delete
// column) where a single misclick has irreversible, hard-to-notice blast
// radius. Comparison is case-sensitive on purpose: a typed confirmation that
// tolerates near-misses isn't meaningfully different from a plain click.
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    confirmText,
    onConfirm,
    onCancel,
}) {
    const confirmBtnRef = useRef(null)
    const cancelBtnRef = useRef(null)
    const typedInputRef = useRef(null)
    const triggerRef = useRef(null)
    const [typedValue, setTypedValue] = useState('')

    useEffect(() => {
        if (open) {
            triggerRef.current = document.activeElement
            setTypedValue('')
            // Focus the typed-confirmation field when present (it's the first
            // thing the viewer needs to act on); otherwise the confirm button.
            if (confirmText) {
                typedInputRef.current?.focus()
            } else {
                confirmBtnRef.current?.focus()
            }
        } else if (triggerRef.current) {
            triggerRef.current.focus?.()
            triggerRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onCancel()
            } else if (e.key === 'Tab') {
                e.preventDefault()
                const focusables = confirmText
                    ? [typedInputRef.current, cancelBtnRef.current, confirmBtnRef.current]
                    : [cancelBtnRef.current, confirmBtnRef.current]
                const active = document.activeElement
                const currentIndex = focusables.indexOf(active)
                const nextIndex = e.shiftKey
                    ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
                    : (currentIndex === -1 || currentIndex === focusables.length - 1 ? 0 : currentIndex + 1)
                focusables[nextIndex]?.focus()
            }
        }
        document.addEventListener('keydown', handleKeyDown, true)
        return () => document.removeEventListener('keydown', handleKeyDown, true)
    }, [open, onCancel, confirmText])

    if (!open) return null

    const typedMismatch = !!confirmText && typedValue !== confirmText

    return (
        <div
            className="modal-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
        >
            <div
                className="card"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                style={{ width: '100%', maxWidth: '420px', padding: '1.75rem' }}
            >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    {danger && (
                        <div style={{
                            width: 36, height: 36, borderRadius: 'var(--r-md)', flexShrink: 0,
                            background: 'var(--danger-bg)', color: 'var(--danger-fg)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <AlertTriangle size={18} />
                        </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 id="confirm-dialog-title" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                            {title}
                        </h2>
                        <p id="confirm-dialog-message" style={{ fontSize: 'var(--fs-4)', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                            {message}
                        </p>
                        {confirmText && (
                            <div style={{ marginTop: '12px' }}>
                                <label htmlFor="confirm-dialog-typed-input" style={{ display: 'block', fontSize: 'var(--fs-2)', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                    Type <strong style={{ color: 'var(--text)' }}>{confirmText}</strong> to confirm
                                </label>
                                <input
                                    id="confirm-dialog-typed-input"
                                    ref={typedInputRef}
                                    type="text"
                                    className="form-input"
                                    autoComplete="off"
                                    value={typedValue}
                                    onChange={e => setTypedValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !typedMismatch) onConfirm() }}
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.25rem' }}>
                    <button id="confirm-dialog-cancel-btn" ref={cancelBtnRef} type="button" className="btn btn-secondary" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        type="button"
                        className={danger ? 'btn btn-danger' : 'btn btn-primary'}
                        onClick={onConfirm}
                        disabled={typedMismatch}
                        style={typedMismatch ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
