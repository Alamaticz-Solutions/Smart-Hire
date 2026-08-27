import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// G-39: every modal in the app (13 call sites, all built on the same
// .modal-overlay/.card markup) previously had no focus trap, no Escape
// handler, and no focus restoration on close - a keyboard user tabbing
// past the last field fell straight through to the page behind it, and
// closing a modal dropped focus back to <body>. This hook adds all three
// to an existing modal's markup with a two-line change at the call site
// (a ref on the dialog container, plus this hook call) instead of forcing
// every modal to be rewritten onto a shared <Modal> component.
export function useModalA11y(isOpen, onClose) {
    const containerRef = useRef(null)
    const triggerRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        triggerRef.current = document.activeElement

        const focusables = containerRef.current?.querySelectorAll(FOCUSABLE)
        focusables?.[0]?.focus()

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose?.()
                return
            }
            if (e.key !== 'Tab' || !containerRef.current) return
            const nodes = Array.from(containerRef.current.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null)
            if (nodes.length === 0) return
            const first = nodes[0]
            const last = nodes[nodes.length - 1]
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown, true)
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true)
            triggerRef.current?.focus?.()
        }
    }, [isOpen, onClose])

    return containerRef
}
