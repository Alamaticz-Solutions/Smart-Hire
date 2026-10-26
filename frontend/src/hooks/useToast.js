import { useCallback, useRef, useState } from 'react'

// Was duplicated verbatim across JobsPage/UploadPage/TemplatesPage/ConnectPage
// (state + 3500ms auto-clear timer), same pattern as useColumnConfig/
// useSessionCache. Each page's render JSX is left as-is (they differ slightly
// in wrapper markup) - only the state/function logic is shared here.
//
// G-27: toasts previously auto-dismissed with no way to read them back or
// close them early, and weren't announced to screen readers. showToast keeps
// its original two-arg signature everywhere it's already called; dismissToast
// lets a rendered toast expose a close button. Errors don't auto-dismiss at
// all (per the audit's "persistent for errors") since they're the one type
// where losing the message before it's read is actively harmful; success/info
// use a 6s timer that pauseToast/resumeToast (wired to ToastHost's
// onMouseEnter/onMouseLeave) can pause mid-flight so hovering to read a
// longer message doesn't race the dismiss.
const AUTO_DISMISS_MS = 6000

export function useToast() {
    const [toast, setToast] = useState(null)
    const timerRef = useRef(null)
    const remainingRef = useRef(AUTO_DISMISS_MS)
    const startedAtRef = useRef(null)

    const showToast = useCallback((msg, type = 'success') => {
        clearTimeout(timerRef.current)
        setToast({ msg, type })
        if (type === 'error') {
            startedAtRef.current = null
            return
        }
        remainingRef.current = AUTO_DISMISS_MS
        startedAtRef.current = Date.now()
        timerRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS)
    }, [])

    const dismissToast = useCallback(() => {
        clearTimeout(timerRef.current)
        startedAtRef.current = null
        setToast(null)
    }, [])

    const pauseToast = useCallback(() => {
        if (startedAtRef.current === null) return
        clearTimeout(timerRef.current)
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current))
        startedAtRef.current = null
    }, [])

    const resumeToast = useCallback(() => {
        if (!toast || toast.type === 'error' || startedAtRef.current !== null) return
        startedAtRef.current = Date.now()
        timerRef.current = setTimeout(() => setToast(null), remainingRef.current)
    }, [toast])

    return { toast, showToast, dismissToast, pauseToast, resumeToast }
}
