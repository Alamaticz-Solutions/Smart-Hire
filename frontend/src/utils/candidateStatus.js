// Single source of truth for the candidate pipeline's status list.
//
// Before this, four different places each hardcoded their own copy:
//   - upload/CandidatesTable.jsx's inline-edit dropdown (8 statuses, correct)
//   - jobs/CandidatesTable.jsx's inline-edit dropdown (the same 8, correct)
//   - excelUtils.js's Excel data-validation dropdown (the same 8, correct)
//   - upload/CandidatesTable.jsx's "Add Candidate" modal (only 5: New,
//     Screening, Interview, Offered, Rejected - "Screening"/"Interview"
//     match no .status-chip CSS class and no PIPELINE_STAGES entry, so a
//     candidate created with either status rendered as an unstyled grey
//     pill and silently dropped out of every dashboard count)
//
// Order matches the pipeline's actual funnel shape (DashboardPage.jsx's
// PIPELINE_STAGES), not alphabetical.
export const CANDIDATE_STATUSES = [
    'New',
    'In-Review',
    'Available',
    'Selected',
    'Engaged',
    'Offered',
    'Hired',
    'Rejected',
]
