import React from 'react';
import { X, Search, Loader } from 'lucide-react';

// Extracted from JobsPage.jsx: the "Add Candidate manually to Job" modal
// (showAddCandidateModal state). Purely presentational; all state/handlers
// are owned by JobsPage.
export default function AddCandidateModal({
    showAddCandidateModal,
    setShowAddCandidateModal,
    unmatchedSearchQuery,
    setUnmatchedSearchQuery,
    loadingUnmatched,
    unmatchedCandidates,
    handleAddCandidateManually,
    addingCandidateId,
}) {
    if (!showAddCandidateModal) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowAddCandidateModal(false)}>
            <div className="card" onClick={e => e.stopPropagation()} style={{
                width: '90%', maxWidth: '500px', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', padding: 0
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800 }}>
                        ➕ Add Candidate manually to Job
                    </h3>
                    <button onClick={() => setShowAddCandidateModal(false)} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex'
                    }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Search Input */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.2)' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-dim)' }} />
                        <input
                            type="text"
                            placeholder="Search candidate by name or email..."
                            value={unmatchedSearchQuery}
                            onChange={e => setUnmatchedSearchQuery(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 10px 10px 36px',
                                background: 'rgba(var(--navy-dark-rgb), 0.8)', border: '1px solid var(--border)',
                                color: 'var(--text)', borderRadius: 8, outline: 'none', fontSize: '0.88rem'
                            }}
                        />
                    </div>
                </div>

                {/* List Container */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {loadingUnmatched ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                        </div>
                    ) : unmatchedCandidates.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                            No candidates available to match.
                        </div>
                    ) : (() => {
                        const filtered = unmatchedCandidates.filter(c => {
                            const q = unmatchedSearchQuery.toLowerCase();
                            return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
                        });

                        if (filtered.length === 0) {
                            return (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                    No matching candidates found.
                                </div>
                            );
                        }

                        return filtered.map(c => (
                            <div
                                key={c.id}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--border)', borderRadius: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ overflow: 'hidden', marginRight: '12px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {c.full_name || 'Unnamed Candidate'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                        Exp: {c.total_experience ? `${c.total_experience} yrs` : '—'} | notice: {c.notice_period || '—'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleAddCandidateManually(c.id)}
                                    className="btn btn-primary"
                                    disabled={Boolean(addingCandidateId)}
                                    style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: addingCandidateId ? 0.6 : 1, cursor: addingCandidateId ? 'not-allowed' : 'pointer' }}
                                >
                                    {addingCandidateId === c.id ? 'Matching…' : 'Match'}
                                </button>
                            </div>
                        ));
                    })()}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end',
                    background: 'rgba(var(--navy-rgb), 0.3)'
                }}>
                    <button
                        onClick={() => setShowAddCandidateModal(false)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
