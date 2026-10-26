import { useEffect } from 'react'

// The document.title effect used to live only inside Layout.jsx, which the
// /login route renders outside of (LoginPage has no shell around it) - so
// logging out from, say, Administration left the browser tab reading
// "Administration · Hire AI" while the sign-in screen was on screen. Both
// branches now set the title through this one hook instead.
export function usePageTitle(title) {
    useEffect(() => {
        document.title = title ? `${title} · Hire AI` : 'Hire AI'
    }, [title])
}
