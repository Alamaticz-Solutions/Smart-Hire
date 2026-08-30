import React, { useEffect } from 'react';
import { Plus, MoreVertical, Share2, Edit, Trash2, Search, UserCheck, Building2 } from 'lucide-react';
import { SkeletonBlock } from '../../components/shared/Skeleton';
import JobStatusChip from '../../components/shared/JobStatusChip';

// Extracted from JobsPage.jsx: the left sidebar "Job List" section
// (status filter select + scrollable job list with per-job actions dropdown).
// Purely presentational — all state/handlers are owned by JobsPage and passed in as props.
export default function JobSidebar({
    isExternal,
    isAdmin,
    filteredJobs,
    loadingJobs,
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
    style,
}) {
    // The per-card options dropdown had no Escape handler and no
    // outside-click dismissal - a keyboard user who opened it had no way
    // to close it except tabbing through its items or reloading the page.
    useEffect(() => {
        if (activeDropdownJobId == null) return
        const handleKeyDown = (e) => { if (e.key === 'Escape') setActiveDropdownJobId(null) }
        const handleClickOutside = () => setActiveDropdownJobId(null)
        document.addEventListener('keydown', handleKeyDown)
        // Capture phase + next-tick-free: the trigger button's own onClick
        // already stopPropagation()s, so this only ever fires for a click
        // genuinely outside the menu.
        document.addEventListener('click', handleClickOutside)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('click', handleClickOutside)
        }
    }, [activeDropdownJobId, setActiveDropdownJobId])

    return (
        <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', ...style }}>
            {/* Was a full 3-word button ("New Job Description") squeezed into
                this 320px header beside the title - wraps/clips at any
                client-name length. Shorter label, fixed 32px height, and its
                own row so it can't collide with the title regardless of width. */}
            <div style={{ padding: '1.2rem 1.5rem 0.8rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontFamily: 'var(--fh)', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                        Job List
                    </div>
                    {!isExternal && (
                        <button className="btn btn-primary" style={{ height: 32, padding: '0 12px', fontSize: '0.82rem' }} onClick={() => setShowNewForm(true)}>
                            <Plus size={14} /> New job
                        </button>
                    )}
                </div>
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
                {loadingJobs ? (
                    // "Page switch feels slow": this used to render "No jobs
                    // found" below immediately, then silently swap in the
                    // real list once the fetch resolved - a false empty-state
                    // flash that read as broken rather than still loading.
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true" aria-label="Loading jobs">
                        {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} height={72} radius={10} />)}
                    </div>
                ) : filteredJobs.length === 0 ? (
                    // Was a hard <br/> forcing the line break regardless of
                    // width, with no way out of the empty state (no clear-
                    // filter, no create-a-job, not even an icon).
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '2rem', padding: '0 0.5rem' }}>
                        <Search size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                        <p style={{ margin: '0 0 14px', textWrap: 'pretty' }}>
                            {statusFilter === 'All' ? 'No open jobs' : `No jobs found matching the "${statusFilter}" status.`}
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {statusFilter !== 'All' && (
                                <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setStatusFilter('All')}>
                                    Clear filter
                                </button>
                            )}
                            {!isExternal && (
                                <button type="button" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setShowNewForm(true)}>
                                    <Plus size={14} /> New job
                                </button>
                            )}
                        </div>
                    </div>
                ) : null}
                {!loadingJobs && filteredJobs.map(job => (
                    // Was a plain <div onClick> - the primary navigation of the
                    // whole Jobs screen was unreachable by keyboard. Restructured
                    // so the "select this job" action is a real <button> wrapping
                    // just the card's informational content, with the options
                    // menu trigger and the "Shared" link as its SIBLINGS (not
                    // descendants) - a <button> can't contain other interactive
                    // elements without breaking both semantics and click-through.
                    <div
                        key={job.id}
                        className={selectedJob?.id === job.id ? 'job-card job-card--selected' : 'job-card'}
                        style={{ position: 'relative', marginBottom: '10px' }}
                    >
                        <button
                            type="button"
                            onClick={() => { setSelectedJob(job); setShowNewForm(false); }}
                            style={{
                                all: 'unset', display: 'block', boxSizing: 'border-box', width: '100%', cursor: 'pointer',
                                padding: '1rem', paddingRight: isAdmin ? '36px' : '1rem', borderRadius: 'inherit',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                {/* Selection used to be signaled three ways at once (gold
                                    border + 10% gold fill + gold title), while hover had no
                                    state at all. One treatment now (.job-card--selected: a
                                    surface lift + 3px left bar, in index.css) - title stays
                                    --text always. */}
                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                    {job.title}
                                </span>
                                {/* Was never rendered on the card at all - the only way to know a
                                    job's status was to filter to it and see what remained, which is
                                    why the live data has statuses hand-appended to titles instead
                                    ("... (On-hold)"), overflowing the 2-line clamp. */}
                                <JobStatusChip status={job.job_status} size="sm" />
                            </div>
                            {job.client_name && (
                                <div style={{ fontSize: '0.76rem', color: 'var(--sky-dim)', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Building2 size={12} /> Client: {job.client_name}
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
                        </button>
                        {!isExternal && job.shared_with && job.shared_with.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setViewingSharedList(job)}
                                style={{
                                    all: 'unset', boxSizing: 'border-box',
                                    fontSize: '0.72rem',
                                    color: 'var(--gold)',
                                    margin: '0 1rem 0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'rgba(var(--gold-rgb), 0.08)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(var(--gold-rgb), 0.15)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.08)'}
                                title="Click to view shared users"
                            >
                                <Share2 size={10} /> Shared ({job.shared_with.length})
                            </button>
                        )}
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
                                        <div role="menu" aria-label="Job options" style={{
                                            position: 'absolute', right: 0, top: '28px',
                                            background: 'var(--navy-dark)', border: '1px solid var(--border)',
                                            borderRadius: '8px', boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                                            zIndex: 100, width: '140px', overflow: 'hidden'
                                        }}>
                                            <button
                                                role="menuitem"
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
                                                role="menuitem"
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
                                                role="menuitem"
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
                    </div>
                ))}
            </div>
        </div>
    );
}
