import { useState } from 'react'

// Was duplicated verbatim across JobsPage/UploadPage/TemplatesPage/ConnectPage
// (state + 3500ms auto-clear timer), same pattern as useColumnConfig/
// useSessionCache. Each page's render JSX is left as-is (they differ slightly
// in wrapper markup) - only the state/function logic is shared here.
export function useToast() {
    const [toast, setToast] = useState(null)
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }
    return { toast, showToast }
}
