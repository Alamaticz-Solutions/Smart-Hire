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
            {/* Was a second "Job Status Grid Dashboard" heading + subtitle
                sitting directly beside the sidebar's own "Job List" heading -
                the topbar above both already says "Jobs" / "Track open roles
                and their candidate funnel status", so this was the actual
                source of "the job list and the dashboard don't feel
                separated": two same-weight headers back to back read as one
                undifferentiated block, not two panels. Just the search now,
                right-aligned, doing the one job this row needs to do. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ position: 'relative', width: '300px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by title or client name..."
                        className="form-input"
                        style={{ paddingLeft: 38, minHeight: 38 }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Status Stats Overview Row - same card/kpi tokens as the
                Dashboard page's KPI row (var(--card-bg)/var(--border)/
                var(--radius)) instead of one-off rgba(navy-dark)/12px-radius
                values, so this reads as the same product. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
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
                        <button
                            key={status}
                            type="button"
                            onClick={() => setStatusFilter(status)}
                            className="kpi-card"
                            style={{
                                cursor: 'pointer', font: 'inherit',
                                borderColor: isActive ? 'var(--gold)' : 'var(--border)',
                                background: isActive ? 'var(--surface-2)' : 'var(--card-bg)',
                            }}
                        >
                            <span className="kpi-label" style={{ color: isActive ? 'var(--gold)' : 'var(--text-muted)' }}>{status}</span>
                            <span className="kpi-value">{count}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setStatusFilter('All')}
                    className="kpi-card"
                    style={{
                        cursor: 'pointer', font: 'inherit',
                        borderColor: statusFilter === 'All' ? 'var(--gold)' : 'var(--border)',
                        background: statusFilter === 'All' ? 'var(--surface-2)' : 'var(--card-bg)',
                    }}
                >
                    <span className="kpi-label" style={{ color: statusFilter === 'All' ? 'var(--gold)' : 'var(--text-muted)' }}>Total Jobs</span>
                    <span className="kpi-value">{jobs.length}</span>
                </button>
            </div>

            {/* Jobs Grid */}
            <div style={{ flex: 1, marginTop: '0.5rem' }}>
                {filteredJobs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
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
                                className="card card--actionable"
                                style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', overflow: 'hidden' }}
                                onClick={() => setSelectedJob(job)}
                            >
                                {/* Status and Type Badges top row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <JobStatusChip status={job.job_status} size="sm" />
                                    <span className="chip" style={{ padding: '2px 8px', cursor: 'default' }}>
                                        {job.job_type || 'Full time'}
                                    </span>
                                </div>

                                {/* Job Title and Client */}
                                <div>
                                    <h4 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--fs-5)', fontFamily: 'var(--fh)', fontWeight: 700 }}>{job.title}</h4>
                                    <span style={{ fontSize: 'var(--fs-3)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
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
                                                <span key={index} className="chip" style={{ padding: '2px 8px', fontSize: 'var(--fs-1)', cursor: 'default' }}>
                                                    {s}
                                                </span>
                                            );
                                        })}
                                        {job.required_skills.split(',').length > 3 && (
                                            <span className="badge badge-gold">
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
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--r-sm)',
                                    textAlign: 'center',
                                    marginTop: 'auto'
                                }}>
                                    <div>
                                        <span style={{ display: 'block', fontSize: 'var(--fs-1)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Matched</span>
                                        <strong style={{ fontSize: 'var(--fs-5)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <Search size={14} style={{ color: 'var(--gold)' }} /> {job.matched_count}
                                        </strong>
                                    </div>
                                    <div style={{ borderLeft: '1px solid var(--border)' }}>
                                        <span style={{ display: 'block', fontSize: 'var(--fs-1)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Selected</span>
                                        <strong style={{ fontSize: 'var(--fs-5)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <UserCheck size={14} style={{ color: 'var(--action)' }} /> {job.selected_count}
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
                                            style={{ padding: '7px', color: 'var(--danger-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                                    <button
                                        type="button"
                                        className="chip"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewingSharedList(job);
                                        }}
                                        style={{ alignSelf: 'flex-start', color: 'var(--gold)', borderColor: 'var(--border-gold)' }}
                                        title="Click to view shared users"
                                    >
                                        <Share2 size={12} /> Shared with {job.shared_with.length} {job.shared_with.length === 1 ? 'user' : 'users'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
