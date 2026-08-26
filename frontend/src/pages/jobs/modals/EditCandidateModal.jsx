import React from 'react';

// Extracted from JobsPage.jsx: the "Edit Candidate & Match Details" modal
// (editingCandidate state) — edits core candidate fields plus the per-job
// AI Match Reason. Named EditCandidateModal rather than the originally
// suggested "MatchModal" because there is no separate match-triggering modal
// in the actual code (handleMatch runs directly off a button in
// JobDetailPanel with no modal); this modal is the closest match-related
// dialog since it includes the AI Match Reason field. Purely presentational;
// all state/handlers are owned by JobsPage.
export default function EditCandidateModal({
    editingCandidate,
    setEditingCandidate,
    editName,
    setEditName,
    editExp,
    setEditExp,
    editSkills,
    setEditSkills,
    editReason,
    setEditReason,
    editCurrentLocation,
    setEditCurrentLocation,
    editPrefLocations,
    setEditPrefLocations,
    handleSaveCandidateEdit,
    isSavingEdit,
}) {
    if (!editingCandidate) return null;

    return (
        <div className="modal-overlay">
            <div className="card" style={{ width: '500px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--fh)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Edit Candidate & Match Details</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Full Name</label>
                        <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="e.g. John Doe"
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Total Experience (years)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={editExp}
                            onChange={e => setEditExp(e.target.value)}
                            placeholder="e.g. 5.5"
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Skills (comma separated)</label>
                        <textarea
                            value={editSkills}
                            onChange={e => setEditSkills(e.target.value)}
                            placeholder="e.g. Pega, Java, SQL"
                            rows={2}
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical', outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Current Location</label>
                        <input
                            type="text"
                            value={editCurrentLocation}
                            onChange={e => setEditCurrentLocation(e.target.value)}
                            placeholder="e.g. Chennai"
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>Preferred Locations (comma separated)</label>
                        <input
                            type="text"
                            value={editPrefLocations}
                            onChange={e => setEditPrefLocations(e.target.value)}
                            placeholder="e.g. Chennai, Bangalore"
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '6px' }}>🤖 AI Match Reason</label>
                        <textarea
                            value={editReason}
                            onChange={e => setEditReason(e.target.value)}
                            placeholder="Explanation of how the candidate fits this job description"
                            rows={3}
                            style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, resize: 'vertical', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setEditingCandidate(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveCandidateEdit} disabled={isSavingEdit}>
                        {isSavingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
