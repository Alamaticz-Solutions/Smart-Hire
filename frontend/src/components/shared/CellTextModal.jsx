import { useState } from 'react'
import { X } from 'lucide-react'
import { useModalA11y } from '../../hooks/useModalA11y'

/**
 * Modal that shows the full, un-truncated text of a table cell (`data.title`
 * / `data.text`) with a copy-to-clipboard button.
 *
 * Extracted from: JobsPage.jsx (`CellTextModal`, ~line 1273) and
 * DashboardPage.jsx (`CellTextModal`, ~line 478).
 *
 * Reconciliation: the two originals were otherwise identical but diverged
 * on how the backdrop was built — JobsPage used the shared `.modal-overlay`
 * CSS class (defined in index.css: fixed-position blur backdrop, centering,
 * fade/scale-in animation, and light/dark theme variants, and it also
 * themes the nested `.card`), while DashboardPage duplicated an equivalent
 * backdrop as an inline `style={{...}}` object with no theme awareness and
 * no animation. `.modal-overlay` is a strict superset of what the inline
 * version did (same fixed/centered/blurred backdrop, plus theming and
 * animation for free), so this merged component standardizes on the CSS
 * class rather than re-inlining the styles.
 */
export default function CellTextModal({ data, onClose }) {
    const [copied, setCopied] = useState(false);
    const modalRef = useModalA11y(true, onClose);

    const handleCopy = () => {
        navigator.clipboard.writeText(data.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div ref={modalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="cell-text-modal-title" onClick={e => e.stopPropagation()} style={{
                width: '90%', maxWidth: '600px', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', padding: 0
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h3 id="cell-text-modal-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800 }}>
                        View {data.title}
                    </h3>
                    <button onClick={onClose} aria-label="Close" style={{
                        background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                        color: 'var(--gold)', cursor: 'pointer', padding: 6, borderRadius: '8px',
                        display: 'flex', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                    >
                        <X size={18} />
                    </button>
                </div>
                <div style={{
                    flex: 1, padding: '24px', overflowY: 'auto',
                    color: 'var(--text)', fontSize: '0.92rem', lineHeight: '1.5',
                    whiteSpace: 'pre-wrap', maxHeight: '50vh', background: 'rgba(0,0,0,0.2)'
                }}>
                    {data.text}
                </div>
                <div style={{
                    padding: '12px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(var(--navy-rgb), 0.3)'
                }}>
                    <button
                        onClick={handleCopy}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px', borderColor: 'var(--border)' }}
                    >
                        {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
                    </button>
                    <button
                        onClick={onClose}
                        className="btn btn-primary"
                        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
