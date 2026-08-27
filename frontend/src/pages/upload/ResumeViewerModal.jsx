import React from 'react'
import { Download, X } from 'lucide-react'

// Extracted from UploadPage.jsx: the "Resume Viewer Modal" — the PDF/DOCX
// iframe viewer opened from CandidateDetailsModal's "View Resume" action.
// Distinct from the shared CandidateDetailsModal. Purely presentational —
// the `viewingPdf` state ({ url, name } or null) and its setter stay in
// UploadPage.
export default function ResumeViewerModal({ viewingPdf, onClose }) {
    if (!viewingPdf) return null
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{
                width: '90%', maxWidth: 1000, height: '90vh',
                display: 'flex', flexDirection: 'column', padding: 0,
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)', borderBottom: '1px solid var(--border)'
                }}>
                    <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.05rem' }}>
                        <span style={{ fontSize: '1.2rem', opacity: 0.8 }}>📄</span> {viewingPdf.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <a
                            href={viewingPdf.url}
                            download
                            style={{
                                background: 'rgba(var(--sky-rgb), 0.1)',
                                border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                color: 'var(--sky-dim)',
                                textDecoration: 'none',
                                fontSize: '0.85rem',
                                fontFamily: 'var(--fh)',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.2)';
                                e.currentTarget.style.color = 'var(--text)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.1)';
                                e.currentTarget.style.color = 'var(--sky-dim)';
                            }}
                        >
                            <Download size={14} /> Download File
                        </a>
                        <button onClick={onClose} style={{
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
                </div>
                <iframe
                    src={`${viewingPdf.url}#view=FitH`}
                    style={{ width: '100%', flex: 1, border: 'none', background: 'var(--surface-sunken)' }}
                    title="Resume Viewer"
                />
            </div>
        </div>
    )
}
