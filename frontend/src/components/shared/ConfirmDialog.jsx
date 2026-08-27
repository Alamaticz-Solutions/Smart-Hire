import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

// Replaces window.confirm() (G-3/G-25): a real dialog with focus trap,
// Escape-to-cancel, and focus restoration to the trigger on close (G-39),
// instead of a native modal that blocks the render thread and can't be
// styled, themed, or given a specific "type to confirm" step.
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}) {
    const confirmBtnRef = useRef(null)
    const triggerRef = useRef(null)

    useEffect(() => {
        if (open) {
            triggerRef.current = document.activeElement
            confirmBtnRef.current?.focus()
        } else if (triggerRef.current) {
            triggerRef.current.focus?.()
            triggerRef.current = null
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onCancel()
            } else if (e.key === 'Tab') {
                // Single-action-pair dialog: keep focus cycling between the two buttons.
                e.preventDefault()
                const active = document.activeElement
                const next = active === confirmBtnRef.current
                    ? document.getElementById('confirm-dialog-cancel-btn')
                    : confirmBtnRef.current
                next?.focus()
            }
        }
        document.addEventListener('keydown', handleKeyDown, true)
        return () => document.removeEventListener('keydown', handleKeyDown, true)
    }, [open, onCancel])

    if (!open) return null

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
                    <div>
                        <h2 id="confirm-dialog-title" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                            {title}
                        </h2>
                        <p id="confirm-dialog-message" style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                            {message}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.25rem' }}>
                    <button id="confirm-dialog-cancel-btn" type="button" className="btn btn-secondary" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        type="button"
                        className={danger ? 'btn btn-danger' : 'btn btn-primary'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
