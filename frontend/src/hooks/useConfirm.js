import { useCallback, useRef, useState } from 'react'

// Promise-based replacement for window.confirm(): `if (await confirm({...}))`
// reads the same as the native call at the site, but renders through
// <ConfirmDialog/> so it can be themed, focus-trapped, and dismissed with
// Escape (G-3/G-25/G-39) instead of blocking the render thread.
export function useConfirm() {
    const [state, setState] = useState(null)
    const resolverRef = useRef(null)

    const confirm = useCallback((opts) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve
            setState({
                title: opts.title || 'Are you sure?',
                message: opts.message || '',
                confirmLabel: opts.confirmLabel || 'Confirm',
                cancelLabel: opts.cancelLabel || 'Cancel',
                danger: opts.danger ?? true,
            })
        })
    }, [])

    const handleConfirm = useCallback(() => {
        resolverRef.current?.(true)
        setState(null)
    }, [])

    const handleCancel = useCallback(() => {
        resolverRef.current?.(false)
        setState(null)
    }, [])

    const confirmDialogProps = {
        open: !!state,
        ...state,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
    }

    return { confirm, confirmDialogProps }
}
