import axios from 'axios';

/**
 * Shared axios instance for all API calls.
 *
 * Previously every page independently redeclared its own copy of the base
 * URL as either `const API_URL = import.meta.env.VITE_API_URL || ''` or
 * `const BACKEND_URL = import.meta.env.VITE_API_URL || ''` (same value, two
 * different names) — see JobsPage.jsx, UploadPage.jsx, ConnectPage.jsx and
 * TemplatesPage.jsx — and DashboardPage.jsx / ChatPage.jsx inlined the same
 * expression ad hoc inside template literals on every call site.
 *
 * `main.jsx` already sets `axios.defaults.baseURL` globally to the same
 * value, so in principle plain `axios` calls already resolve correctly.
 * However DashboardPage.jsx (around the "view formatted resume" button in
 * the candidate details modal) references a bare `API_URL` identifier that
 * is never declared anywhere in that file — every other call site in that
 * file uses `import.meta.env.VITE_API_URL` directly instead. When
 * `VITE_API_URL` is unset, `import.meta.env.VITE_API_URL || API_URL || ''`
 * still throws `ReferenceError: API_URL is not defined` before the `||`
 * short-circuit ever gets a chance to fall back to `''`, because merely
 * *referencing* an undeclared identifier throws, whereas an *unset* env var
 * safely evaluates to `undefined`.
 *
 * Importing `apiClient` from this module (instead of bare `axios` plus a
 * locally redeclared base URL constant) removes the need for that
 * per-file constant entirely, which removes the class of bug above by
 * construction. Pages should switch their axios calls from
 * `axios.get(...)` / `axios.post(...)` etc. to `apiClient.get(...)` /
 * `apiClient.post(...)` etc. and drop their local `API_URL` / `BACKEND_URL`
 * declarations once they're rewired to use this module (a later phase).
 */
const BASE_URL = import.meta.env.VITE_API_URL || '';

const apiClient = axios.create({
    baseURL: BASE_URL,
});

/**
 * Auth header injection.
 *
 * `App.jsx` keeps the logged-in user in `localStorage['hire_ai_user']` and,
 * on every `user` change, sets `axios.defaults.headers.common['x-user-username']`
 * on the *global* `axios` singleton so plain `axios.get(...)` calls picked it
 * up automatically. `apiClient` is a separate instance created via
 * `axios.create()`, which snapshots `axios.defaults` only once at creation
 * time — it does not observe later mutations to the global instance's
 * defaults. Without this interceptor, every call made through `apiClient`
 * would silently drop the `x-user-username` header (breaking every
 * approved-user/ownership check server-side) unless a page happened to pass
 * it manually per-call, which several pages did, and inconsistently (some
 * referenced a `user` variable that isn't in scope in that component at all,
 * a separate pre-existing bug of its own).
 *
 * This interceptor reads the same localStorage key App.jsx writes to and
 * sets the header on every outgoing request, so `apiClient` is correct on
 * its own regardless of what any page component does or doesn't pass
 * manually.
 */
apiClient.interceptors.request.use((config) => {
    try {
        const user = JSON.parse(localStorage.getItem('hire_ai_user'));
        // The backend verifies `x-session-token` (main.py's
        // verify_session_middleware) rather than trusting a plain
        // username header - see App.jsx's matching useEffect for the
        // same headers set on the global axios instance. `x-acting-as`
        // is only honored server-side when the signed-in user is admin/hr.
        if (user?.token) {
            config.headers['x-session-token'] = user.token;
            if (user.active_persona) {
                config.headers['x-acting-as'] = user.active_persona;
            }
        }
    } catch {
        // Malformed/missing localStorage value: send the request without
        // the header, same as App.jsx's own try/catch-free `user &&
        // user.username` guard would effectively no-op for a bad value.
    }
    return config;
});

export default apiClient;

/**
 * Builds the URL for a file served from the backend's `/static` mount
 * (resumes, uploaded PDFs, etc.), matching the `${API base}/static/${filename}`
 * pattern that is currently duplicated inline across DashboardPage.jsx,
 * JobsPage.jsx and UploadPage.jsx (e.g. for resume preview iframes and
 * "view/download resume" links).
 *
 * Note: three call sites (DashboardPage.jsx:412, JobsPage.jsx:1206,
 * UploadPage.jsx:1954) append a `#view=FitH` PDF-viewer fragment after the
 * static URL for inline preview iframes. This helper returns the bare URL
 * only — callers that need the fragment should append it themselves, e.g.
 * `getStaticUrl(candidate.filename) + '#view=FitH'`.
 *
 * @param {string} filename - The stored filename to build a static URL for.
 * @returns {string} The full URL to the static asset.
 */
export function getStaticUrl(filename) {
    return `${BASE_URL}/static/${filename}`;
}
