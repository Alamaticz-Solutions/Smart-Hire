import { useCallback, useRef, useState } from 'react'

// Was duplicated verbatim across JobsPage/UploadPage/TemplatesPage/ConnectPage
// (state + 3500ms auto-clear timer), same pattern as useColumnConfig/
// useSessionCache. Each page's render JSX is left as-is (they differ slightly
// in wrapper markup) - only the state/function logic is shared here.
//
// G-27: toasts previously auto-dismissed with no way to read them back or
// close them early, and weren't announced to screen readers. showToast keeps
// its original two-arg signature everywhere it's already called; dismissToast
// lets a rendered toast expose a close button.
export function useToast() {
    const [toast, setToast] = useState(null)
    const timerRef = useRef(null)

    const showToast = useCallback((msg, type = 'success') => {
        clearTimeout(timerRef.current)
        setToast({ msg, type })
        timerRef.current = setTimeout(() => setToast(null), 5000)
    }, [])

    const dismissToast = useCallback(() => {
        clearTimeout(timerRef.current)
        setToast(null)
    }, [])

    return { toast, showToast, dismissToast }
}
