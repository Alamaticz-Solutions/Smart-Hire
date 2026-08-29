import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

// The app had no error boundary anywhere - an uncaught render error in any
// one page (a null-deref on a malformed API response, a bad prop, etc.)
// unmounted the whole React tree and left a blank white screen with no way
// back except a manual reload. This catches render errors below it and
// offers a reload instead, without needing every page to defensively guard
// every render path itself.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error, info) {
        console.error('Unhandled render error caught by ErrorBoundary:', error, info)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: '1rem', padding: '2rem', textAlign: 'center', color: 'var(--text-dim, #888)'
                }}>
                    <AlertTriangle size={40} style={{ opacity: 0.7 }} />
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text, #eee)' }}>Something went wrong.</div>
                    <p style={{ margin: 0, maxWidth: 420 }}>This page hit an unexpected error. Reloading usually fixes it.</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => window.location.reload()}
                        style={{ padding: '8px 20px' }}
                    >
                        Reload
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
