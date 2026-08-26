import React from 'react'
import { UploadCloud, Upload } from 'lucide-react'

// Extracted from UploadPage.jsx: the "Drop Zone" card — the resume/Excel
// drag-and-drop upload area plus the per-file upload progress list.
// Purely presentational — useDropzone() itself is still called in
// UploadPage (its outputs are passed down here as props), and all upload
// state/handlers (onDrop, progress) are owned by UploadPage.
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
            <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ textAlign: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: '8px', background: isDragActive ? 'rgba(var(--sky-rgb), 0.1)' : 'var(--input-bg)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <input {...getInputProps()} />
                <div style={{ marginBottom: '1rem' }}>
                    <UploadCloud size={40} className="icon" style={{ color: 'var(--sky)', filter: 'drop-shadow(0 0 10px rgba(var(--sky-rgb), 0.5))' }} />
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
                                <span className={`badge ${p.status === 'done' ? 'badge-green' : p.status === 'error' ? 'badge-red' : 'badge-sky'}`}>
                                    {p.status === 'done' ? '✓ Done' : p.status === 'error' ? '✗ Error' : 'Processing…'}
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
