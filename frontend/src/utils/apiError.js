// Was JSON.stringify(err.response.data.detail) at one call site and a
// bare string concatenation ('Failed to X: ' + detail) at others - a
// FastAPI request-validation failure (422) returns `detail` as an ARRAY of
// {loc, msg, type} objects, not a string, so both patterns rendered a raw
// JSON blob or "[object Object]" straight into a toast/status line. This
// is specifically the screen where credentials are typed in (Integrations),
// so an unreadable error there stalls setup entirely.
//
// Returns a single human-readable sentence for any shape FastAPI/axios can
// hand back: a plain string detail, a Pydantic validation array, a nested
// error object, or a network-level error with no response at all.
export function formatApiError(err, fallback = 'Something went wrong. Please try again.') {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail) && detail.length) {
        return detail
            .map(d => {
                const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null
                return field ? `${field}: ${d.msg}` : d?.msg
            })
            .filter(Boolean)
            .join('; ') || fallback
    }
    if (detail && typeof detail === 'object') {
        return detail.msg || fallback
    }
    if (err?.message) return err.message
    return fallback
}
