import React from 'react';
import { Share2, X, Loader } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';

// Extracted from JobsPage.jsx: the job-sharing modal cluster — the
// "Shared Candidates" viewer (viewingSharedList state) and the "Share Job
// Profile" editor (showShareModal state). Both are bundled in this one file
// (rather than split further) since they're two views of the same sharing
// feature and the "manage shares" action in the viewer opens the editor.
// Purely presentational; all state/handlers are owned by JobsPage.
export default function ShareModal({
    viewingSharedList,
    setViewingSharedList,
    handleOpenShareModal,
    showShareModal,
    setShowShareModal,
    loadingShares,
    externalUsers,
    sharedUsernames,
    setSharedUsernames,
    handleSaveShares,
}) {
    const sharedListModalRef = useModalA11y(!!viewingSharedList, () => setViewingSharedList(null));
    const shareModalRef = useModalA11y(showShareModal, () => setShowShareModal(false));
    return (
        <>
            {viewingSharedList && (
                <div className="modal-overlay" onClick={() => setViewingSharedList(null)}>
                    <div ref={sharedListModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="shared-list-modal-title" onClick={e => e.stopPropagation()} style={{
                        width: '95%', maxWidth: '400px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column', padding: 0
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 id="shared-list-modal-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Share2 size={18} /> Shared Candidates
                            </h3>
                            <button onClick={() => setViewingSharedList(null)} aria-label="Close" style={{
                                background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', color: 'var(--text)' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                                This job description is shared with the following external candidate accounts:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {viewingSharedList.shared_with.map(username => (
                                    <div
                                        key={username}
                                        style={{
                                            padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid var(--border)', borderRadius: '8px',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{username}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '12px 24px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', gap: '10px',
                            background: 'rgba(var(--navy-rgb), 0.3)', alignItems: 'center'
                        }}>
                            <button
                                onClick={() => {
                                    const jobToShare = viewingSharedList;
                                    setViewingSharedList(null);
                                    handleOpenShareModal(jobToShare);
                                }}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            >
                                ✏ Manage Shares
                            </button>
                            <button
                                onClick={() => setViewingSharedList(null)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showShareModal && (
                <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
                    <div ref={shareModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="share-job-modal-title" onClick={e => e.stopPropagation()} style={{
                        width: '90%', maxWidth: '500px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column', padding: 0
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 id="share-job-modal-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Share2 size={18} /> Share Job Profile
                            </h3>
                            <button onClick={() => setShowShareModal(false)} aria-label="Close" style={{
                                background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', color: 'var(--text)' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                                Select the external candidates/users who should be permitted to view this Job Description.
                            </p>
                            {loadingShares ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                                </div>
                            ) : externalUsers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                    No external users registered. Check the "External" role in Admin Portal to add external users.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {externalUsers.map(u => (
                                        <label
                                            key={u.username}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                                                border: '1px solid var(--border)', borderRadius: '8px',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={sharedUsernames.includes(u.username)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSharedUsernames([...sharedUsernames, u.username]);
                                                    } else {
                                                        setSharedUsernames(sharedUsernames.filter(uname => uname !== u.username));
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--gold)' }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.full_name}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>@{u.username}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '12px 24px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end', gap: '10px',
                            background: 'rgba(var(--navy-rgb), 0.3)'
                        }}>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveShares}
                                className="btn btn-primary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                                disabled={loadingShares || externalUsers.length === 0}
                            >
                                Save Shares
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
