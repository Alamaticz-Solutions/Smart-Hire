import React from 'react'
import { UploadCloud, Upload } from 'lucide-react'

// Extracted from UploadPage.jsx: the "Drop Zone" card — the resume/Excel
// drag-and-drop upload area plus the per-file upload progress list.
// Purely presentational — useDropzone() itself is still called in
// UploadPage (its outputs are passed down here as props), and all upload
// state/handlers (onDrop, progress) are owned by UploadPage.
//
// S4.2: react-dropzone's getRootProps() already makes the root focusable
// (tabIndex 0) and Enter/Space-operable by default (noKeyboard isn't set),
// so keyboard operation itself worked; what was missing was an accessible
// name for that focusable target and for the hidden <input type="file">
// (neither had one) — both get an explicit aria-label below. The resting
// state also dropped the always-on icon glow (loud for an action taken
// once per session) in favor of a plain icon that only picks up emphasis
// on hover/focus via the shared --action token, matching G-7.
export default function UploadDropzone({
    getRootProps,
    getInputProps,
    isDragActive,
    progress,
}) {
    return (
        <div className="card">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontWeight: 600, color: 'var(--sky)' }}>
                <Upload size={18} /> Upload Resumes / Excel Sheets
            </div>
            <div
                {...getRootProps({
                    role: 'button',
                    'aria-label': 'Upload resumes or candidate spreadsheets: drag and drop files, or press Enter to browse',
                })}
                className={`dropzone${isDragActive ? ' active' : ''}`}
                style={{
                    textAlign: 'center', padding: '2rem',
                    borderWidth: '2px', borderStyle: 'dashed', borderColor: isDragActive ? 'var(--action)' : 'var(--border)',
                    borderRadius: '8px', background: isDragActive ? 'rgba(var(--sky-rgb), 0.1)' : 'var(--input-bg)', cursor: 'pointer', transition: 'all 0.2s',
                }}
            >
                <input {...getInputProps({ 'aria-label': 'Choose resume or spreadsheet files to upload' })} />
                <div style={{ marginBottom: '1rem' }}>
                    <UploadCloud size={36} className="icon" style={{ color: isDragActive ? 'var(--action)' : 'var(--text-muted)' }} />
                </div>
                <div className="dropzone-text" style={{ color: 'var(--text-dim)' }}>
                    {isDragActive ? <strong>Drop here…</strong> : <><strong>Drag & drop</strong> PDF / DOCX resumes or XLSX/XLS/CSV sheets, or click to browse</>}
                </div>
            </div>
            {progress.length > 0 && (
                <div style={{ marginTop: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {progress.map((p, i) => (
                        <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{p.name}</span>
                                <span
                                    className={`badge ${p.status === 'done' ? 'badge-green' : p.status === 'error' ? 'badge-red' : 'badge-sky'}`}
                                    title={p.status === 'error' ? (p.error || 'Upload failed') : undefined}
                                >
                                    {p.status === 'done' ? '✓ Done' : p.status === 'error' ? `✗ ${p.error || 'Error'}` : 'Processing…'}
                                </span>
                            </div>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.percent}%` }} /></div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
