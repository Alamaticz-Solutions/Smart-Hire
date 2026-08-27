import React from 'react'
import { X, Check } from 'lucide-react'

// Extracted from UploadPage.jsx: the "Filter Candidates" modal (min total /
// pega experience, Pega certifications, and the custom column-based
// additional filters list). Purely presentational — all filter state
// (filters, customFilters, columnFilters) and handlers stay in UploadPage.
export default function FilterModal({
    onClose,
    filters,
    setFilters,
    PEGA_CERTS,
    toggleCert,
    customFilters,
    setCustomFilters,
    setColumnFilters,
    cols,
}) {
    return (
        <div className="modal-overlay">
            <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                    <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Filter Candidates</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Total Experience (Years)</label>
                        <input
                            type="number"
                            value={filters.minTotalExp} onChange={e => setFilters(p => ({ ...p, minTotalExp: e.target.value }))}
                            placeholder="e.g. 5"
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Pega Experience (Years)</label>
                        <input
                            type="number"
                            value={filters.minPegaExp} onChange={e => setFilters(p => ({ ...p, minPegaExp: e.target.value }))}
                            placeholder="e.g. 3"
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Pega Certifications</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {PEGA_CERTS.map(cert => (
                                <button
                                    key={cert}
                                    onClick={() => toggleCert(cert)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: filters.certs.includes(cert) ? 'rgba(var(--gold-rgb), 0.15)' : 'var(--input-bg)',
                                        border: `1px solid ${filters.certs.includes(cert) ? 'var(--gold)' : 'var(--border)'}`,
                                        color: filters.certs.includes(cert) ? 'var(--gold)' : 'var(--text)',
                                        padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                                        transition: 'all 0.2s'
                                    }}>
                                    {filters.certs.includes(cert) && <Check size={12} />}
                                    {cert}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Additional Filters</label>
                            <button
                                onClick={() => setCustomFilters(p => [...p, { col: cols.find(c => c.key !== '_del')?.key || '', val: '' }])}
                                style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fb)' }}>
                                + Add Filter
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '150px', overflowY: 'auto' }}>
                            {customFilters.map((cf, i) => (
                                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <select
                                        value={cf.col}
                                        onChange={e => { const newF = [...customFilters]; newF[i].col = e.target.value; setCustomFilters(newF); }}
                                        style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }}>
                                        {cols.filter(c => c.key !== '_del').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                    <input
                                        value={cf.val}
                                        onChange={e => { const newF = [...customFilters]; newF[i].val = e.target.value; setCustomFilters(newF); }}
                                        placeholder="e.g. Hyderabad"
                                        style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }}
                                    />
                                    <button
                                        onClick={() => setCustomFilters(p => p.filter((_, idx) => idx !== i))}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger-fg)', cursor: 'pointer', padding: '0 4px', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {customFilters.length === 0 && (
                                <div style={{ fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.4)', fontStyle: 'italic' }}>
                                    No additional filters applied.
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <button className="btn btn-secondary" onClick={() => { setFilters({ minTotalExp: '', minPegaExp: '', certs: [] }); setCustomFilters([]); setColumnFilters({}); }} style={{ flex: 1, borderColor: 'var(--border)' }}>
                            Clear All
                        </button>
                        <button className="btn" onClick={onClose} style={{ flex: 1, background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: '900', border: 'none' }}>
                            Apply Filter
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
