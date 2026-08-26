/**
 * Formats a raw timestamp for the "Analyzed: ..." label shown on candidate
 * cards. Copy-pasted identically as `new Date(candidate.timestamp).toLocaleDateString()`
 * (no locale or options argument) in DashboardPage.jsx, JobsPage.jsx and
 * UploadPage.jsx — this preserves that exact behavior (browser-default
 * locale and formatting) rather than introducing new formatting options.
 *
 * @param {string} dateString - A date string parseable by `new Date(...)` (e.g. an ISO timestamp).
 * @returns {string} The locale-formatted date string, e.g. "8/25/2026".
 */
export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}
