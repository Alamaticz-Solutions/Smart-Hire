// Candidate-status -> cleanup's .status-chip CSS class.
// Mirrors the inline `'status-' + s.toLowerCase().replace(/\s+/g, '-')`
// already used in upload/CandidatesTable.jsx and jobs/CandidatesTable.jsx,
// so every surface (tables, the routed candidate page, dashboard) renders
// the same chip. The class rules live in index.css (.status-chip.status-*).
export function statusChipClass(status) {
    const slug = String(status || 'New').trim().toLowerCase().replace(/\s+/g, '-')
    return `status-chip status-${slug || 'new'}`
}

export { CANDIDATE_STATUSES } from './candidateStatus'
