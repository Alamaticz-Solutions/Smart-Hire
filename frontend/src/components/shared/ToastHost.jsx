import { CheckCircle, AlertCircle, X } from 'lucide-react'

// Shared render for the toast state produced by useToast(). role="status" +
// aria-live="polite" announces it to screen readers (G-27, G-4.1.3); the
// dismiss button lets a viewer close it before the 5s auto-timeout instead
// of only being able to wait it out.
export default function ToastHost({ toast, onDismiss, onPause, onResume }) {
    if (!toast) return null
    const Icon = toast.type === 'error' ? AlertCircle : CheckCircle
    return (
        <div className="toast-container">
            <div
                className={`toast ${toast.type}`}
                role="status"
                aria-live="polite"
                onMouseEnter={onPause}
                onMouseLeave={onResume}
            >
                <span className="toast-icon"><Icon size={16} /></span>
                <span>{toast.msg}</span>
                {onDismiss && (
                    <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss notification">
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    )
}
