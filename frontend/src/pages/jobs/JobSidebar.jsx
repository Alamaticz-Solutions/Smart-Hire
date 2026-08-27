import React from 'react';
import { Plus, MoreVertical, Share2, Edit, Trash2, Search, UserCheck } from 'lucide-react';

// Extracted from JobsPage.jsx: the left sidebar "Job List" section
// (status filter select + scrollable job list with per-job actions dropdown).
// Purely presentational — all state/handlers are owned by JobsPage and passed in as props.
export default function JobSidebar({
    isExternal,
    isAdmin,
    filteredJobs,
    selectedJob,
    setSelectedJob,
    setShowNewForm,
    statusFilter,
    setStatusFilter,
    activeDropdownJobId,
    setActiveDropdownJobId,
    setShowDropdown,
    handleOpenShareModal,
    handleStartEditJob,
    handleDeleteJob,
    setViewingSharedList,
}) {
    return (
        <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--fh)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold)' }}>
                    Job Descriptions
                </div>
                {!isExternal && (
                    <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => setShowNewForm(true)}>
                        <Plus size={16} /> New Job Description
                    </button>
                )}
            </div>

            {/* Status Filter */}
            <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 600 }}>Filter by Job Status</label>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.82rem' }}
                >
                    <option value="All">All Jobs</option>
                    <option value="In-progress">In-progress</option>
                    <option value="On-hold">On-hold</option>
                    <option value="Filled">Filled</option>
                    <option value="Closed">Closed</option>
                </select>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {filteredJobs.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem' }}>
                        No jobs found matching<br/>the selected status.
                    </div>
                )}
                {filteredJobs.map(job => (
                    <div
                        key={job.id}
                        onClick={() => { setSelectedJob(job); setShowNewForm(false); }}
                        style={{
                            position: 'relative',
                            padding: '1rem', borderRadius: '12px', marginBottom: '10px', cursor: 'pointer',
                            border: `1px solid ${selectedJob?.id === job.id ? 'var(--gold)' : 'var(--border)'}`,
                            background: selectedJob?.id === job.id ? 'rgba(var(--gold-rgb), 0.1)' : 'var(--input-bg)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ fontWeight: 700, color: selectedJob?.id === job.id ? 'var(--gold)' : 'var(--text)', marginBottom: '4px', paddingRight: '24px' }}>
                            {job.title}
                        </div>
                        {isAdmin && (
                            <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdownJobId(activeDropdownJobId === job.id ? null : job.id);
                                        setShowDropdown(false);
                                    }}
                                    aria-label="Job options"
                                    aria-haspopup="menu"
                                    aria-expanded={activeDropdownJobId === job.id}
                                    style={{
                                        background: 'var(--navy-dark)', border: '1px solid var(--border)', color: 'var(--text)',
                                        cursor: 'pointer', padding: '6px', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', borderRadius: '4px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                                >
                                        <MoreVertical size={16} />
                                    </button>
                                    {activeDropdownJobId === job.id && (
                                        <div style={{
                                            position: 'absolute', right: 0, top: '28px',
                                            background: 'var(--navy-dark)', border: '1px solid var(--border)',
                                            borderRadius: '8px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                                            zIndex: 100, width: '140px', overflow: 'hidden'
                                        }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownJobId(null);
                                                    handleOpenShareModal(job);
                                                }}
                                                style={{
                                                    width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                                                    color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem',
                                                    display: 'flex', alignItems: 'center', gap: '8px'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Share2 size={14} /> Share
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownJobId(null);
                                                    handleStartEditJob(job);
                                                }}
                                                style={{
                                                    width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                                                    color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem',
                                                    display: 'flex', alignItems: 'center', gap: '8px'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Edit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownJobId(null);
                                                    handleDeleteJob(job.id);
                                                }}
                                                style={{
                                                    width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                                                    color: 'var(--danger-fg)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem',
                                                    display: 'flex', alignItems: 'center', gap: '8px'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        {job.client_name && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--sky-dim)', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🏢 Client: {job.client_name}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Search size={12}/> {job.matched_count} Matched
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <UserCheck size={12}/> {job.selected_count} Selected
                            </span>
                        </div>
                        {!isExternal && job.shared_with && job.shared_with.length > 0 && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingSharedList(job);
                                }}
                                style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--gold)',
                                    marginTop: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(var(--gold-rgb), 0.08)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(var(--gold-rgb), 0.15)',
                                    width: 'fit-content'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.08)'}
                                title="Click to view shared users"
                            >
                                <Share2 size={10} /> Shared ({job.shared_with.length})
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
