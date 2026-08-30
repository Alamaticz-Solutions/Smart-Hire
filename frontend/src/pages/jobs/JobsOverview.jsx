import React from 'react';
import { Briefcase, Search, X, Share2, UserCheck, ChevronRight, Trash2 } from 'lucide-react';
import JobStatusChip from '../../components/shared/JobStatusChip';

// Extracted from JobsPage.jsx: the dashboard shown when no job is selected and
// the "new job" form isn't open — search bar, status stat tiles, and the jobs
// grid cards. Purely presentational; all state/handlers are owned by JobsPage.
export default function JobsOverview({
    jobs,
    filteredJobs,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    setSelectedJob,
    isExternal,
    handleOpenShareModal,
    handleDeleteJob,
    setViewingSharedList,
}) {
    return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
            {/* Dashboard Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ fontFamily: 'var(--fh)', color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Briefcase size={28} /> Job Status Grid Dashboard
                    </h2>
                    <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                        Overview of all open jobs and their candidate funnel status.
                    </p>
                </div>

                {/* Dashboard Search */}
                <div style={{ position: 'relative', width: '300px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by title or client name..."
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--text)',
                            fontSize: '0.88rem',
                            outline: 'none',
                            transition: 'all 0.2s'
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Status Stats Overview Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                {['In-progress', 'On-hold', 'Filled', 'Closed'].map(status => {
                    // A job with no job_status set (possible for older/manually-
                    // created rows) fell into none of these four buckets, so
                    // "Total Jobs" below - a plain jobs.length - didn't match
                    // their sum. JobStatusChip already treats a missing status
                    // as "In-progress" for display; count them the same way so
                    // the numbers agree with what the chip on that job's own
                    // card shows.
                    const count = jobs.filter(j => (j.job_status || 'In-progress') === status).length;
                    const isActive = statusFilter === status;

                    return (
                        <div
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            style={{
                                padding: '1.25rem',
                                borderRadius: '12px',
                                background: isActive ? 'rgba(var(--gold-rgb), 0.12)' : 'rgba(var(--navy-dark-rgb), 0.3)',
                                border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                textAlign: 'center',
                                transform: isActive ? 'scale(1.03)' : 'scale(1)'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'rgba(var(--sky-rgb), 0.5)' }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
                        >
                            <span style={{ display: 'block', fontSize: '0.8rem', color: isActive ? 'var(--gold)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05rem', fontWeight: 600 }}>
                                {status}
                            </span>
                            <span style={{ display: 'block', fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '6px' }}>
                                {count}
                            </span>
                        </div>
                    );
                })}
                <div
                    onClick={() => setStatusFilter('All')}
                    style={{
                        padding: '1.25rem',
                        borderRadius: '12px',
                        background: statusFilter === 'All' ? 'rgba(var(--gold-rgb), 0.12)' : 'rgba(var(--navy-dark-rgb), 0.3)',
                        border: `1px solid ${statusFilter === 'All' ? 'var(--gold)' : 'var(--border)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                        transform: statusFilter === 'All' ? 'scale(1.03)' : 'scale(1)'
                    }}
                    onMouseEnter={e => { if (statusFilter !== 'All') e.currentTarget.style.borderColor = 'rgba(var(--sky-rgb), 0.5)' }}
                    onMouseLeave={e => { if (statusFilter !== 'All') e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                    <span style={{ display: 'block', fontSize: '0.8rem', color: statusFilter === 'All' ? 'var(--gold)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05rem', fontWeight: 600 }}>
                        Total Jobs
                    </span>
                    <span style={{ display: 'block', fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '6px' }}>
                        {jobs.length}
                    </span>
                </div>
            </div>

            {/* Jobs Grid */}
            <div style={{ flex: 1, marginTop: '0.5rem' }}>
                {filteredJobs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-dim)', background: 'rgba(var(--navy-dark-rgb), 0.1)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <Briefcase size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <h4 style={{ color: 'var(--text)', margin: '0 0 8px 0' }}>No jobs match your selection</h4>
                        <p style={{ margin: 0, fontSize: '0.88rem' }}>Try clearing filters or search to view other job postings, or create a new job profile.</p>
                        {(statusFilter !== 'All' || searchQuery) && (
                            <button
                                className="btn btn-secondary"
                                style={{ marginTop: '1.2rem' }}
                                onClick={() => { setStatusFilter('All'); setSearchQuery(''); }}
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                        {filteredJobs.map(job => (
                            <div
                                key={job.id}
                                style={{
                                    background: 'var(--bg-darker)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                    transition: 'all 0.25s',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => setSelectedJob(job)}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.borderColor = 'var(--gold)';
                                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {/* Status and Type Badges top row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <JobStatusChip status={job.job_status} size="sm" />
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', background: 'rgba(var(--sky-rgb), 0.08)', padding: '2px 8px', borderRadius: '4px' }}>
                                        {job.job_type || 'Full time'}
                                    </span>
                                </div>

                                {/* Job Title and Client */}
                                <div>
                                    <h4 style={{ margin: 0, color: 'var(--gold)', fontSize: '1.15rem', fontFamily: 'var(--fh)', fontWeight: 800 }}>{job.title}</h4>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                                        Client: <strong style={{ color: 'var(--text)' }}>{job.client_name || 'N/A'}</strong>
                                    </span>
                                </div>

                                {/* Required Skills tags */}
                                {job.required_skills && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {job.required_skills.split(',').slice(0, 3).map((skill, index) => {
                                            const s = skill.trim();
                                            if (!s) return null;
                                            return (
                                                <span key={index} style={{ fontSize: '0.72rem', background: 'rgba(var(--sky-rgb), 0.08)', color: 'var(--sky-dim)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                                                    {s}
                                                </span>
                                            );
                                        })}
                                        {job.required_skills.split(',').length > 3 && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                                +{job.required_skills.split(',').length - 3} more
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Counters Funnel */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '8px',
                                    padding: '10px',
                                    background: 'rgba(var(--navy-dark-rgb), 0.4)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    textAlign: 'center',
                                    marginTop: 'auto'
                                }}>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Matched</span>
                                        <strong style={{ fontSize: '1.1rem', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <Search size={14} style={{ color: 'var(--gold)' }} /> {job.matched_count}
                                        </strong>
                                    </div>
                                    <div style={{ borderLeft: '1px solid var(--border)' }}>
                                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Selected</span>
                                        <strong style={{ fontSize: '1.1rem', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <UserCheck size={14} style={{ color: 'var(--primary)' }} /> {job.selected_count}
                                        </strong>
                                    </div>
                                </div>

                                {/* Details Button and Delete Icon */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1, padding: '7px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedJob(job);
                                        }}
                                    >
                                        Open Details <ChevronRight size={14} />
                                    </button>
                                    {!isExternal && (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '7px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', borderColor: 'var(--border)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenShareModal(job);
                                            }}
                                            title="Share this job description with external users"
                                        >
                                            <Share2 size={14} /> Share
                                        </button>
                                    )}
                                    {!isExternal && (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '7px', borderColor: 'rgba(var(--red-rgb), 0.3)', color: 'var(--danger-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteJob(job.id);
                                            }}
                                            title="Delete job description completely"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                                {/* Share status indicator */}
                                {!isExternal && job.shared_with && job.shared_with.length > 0 && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewingSharedList(job);
                                        }}
                                        style={{
                                            fontSize: '0.78rem',
                                            color: 'var(--gold)',
                                            marginTop: '8px',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            background: 'rgba(var(--gold-rgb), 0.1)',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(var(--gold-rgb), 0.2)',
                                            width: 'fit-content',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.18)';
                                            e.currentTarget.style.borderColor = 'var(--gold)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)';
                                            e.currentTarget.style.borderColor = 'rgba(var(--gold-rgb), 0.2)';
                                        }}
                                        title="Click to view shared users"
                                    >
                                        <Share2 size={12} /> Shared with {job.shared_with.length} {job.shared_with.length === 1 ? 'user' : 'users'}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
