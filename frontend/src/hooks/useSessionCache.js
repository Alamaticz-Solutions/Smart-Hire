import { useEffect, useRef, useState } from 'react';

function readFromStorage(key, initialValue) {
    try {
        const raw = sessionStorage.getItem(key);
        if (raw == null) return initialValue;
        const parsed = JSON.parse(raw);
        return parsed == null ? initialValue : parsed;
    } catch {
        return initialValue;
    }
}

function writeToStorage(key, value) {
    try {
        if (value == null) {
            sessionStorage.removeItem(key);
        } else {
            sessionStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
        // sessionStorage unavailable/full — keep the in-memory value regardless.
    }
}

/**
 * `useState`-like hook whose value is persisted to `sessionStorage` as
 * JSON, generalizing a pattern that was reimplemented independently (not
 * identically, but similarly in spirit) in DashboardPage.jsx, JobsPage.jsx
 * and UploadPage.jsx to survive client-side navigation between pages
 * within a session (e.g. `cached_candidates`, `cached_jobs`,
 * `cached_selected_job`, `cached_job_candidates_${jobId}`).
 *
 * Behavior:
 *   - Lazily reads `sessionStorage.getItem(key)` on first render (mirrors
 *     every original call site's `useState(() => { try { return
 *     JSON.parse(sessionStorage.getItem(key)) || initialValue } catch {
 *     return initialValue } })` pattern).
 *   - `setValue(next)` (plain value or updater function, like `useState`)
 *     writes the new value back to `sessionStorage` under `key`, JSON
 *     serialized, as a side effect performed *outside* the state updater
 *     (never inside `setState(prev => ...)`) so it stays correct under
 *     React StrictMode's double-invocation of updaters in development and
 *     doesn't fire when React bails out of an update. Writing
 *     `null`/`undefined` removes the key instead of storing the literal
 *     string `"null"` — this matches JobsPage.jsx's explicit
 *     `sessionStorage.removeItem('cached_selected_job')` when
 *     `selectedJob` is cleared.
 *   - If `key` itself changes between renders, the hook re-reads the new
 *     key's cached value from `sessionStorage` (falling back to
 *     `initialValue` if absent) rather than continuing to show stale data
 *     under the old key. This is what lets a single hook instance serve a
 *     *dynamic* cache key such as `` `cached_job_candidates_${jobId}` ``.
 *
 * Known divergences to double check before adopting at each call site:
 *   - This hook persists to `sessionStorage` on *every* `setValue` call.
 *     JobsPage.jsx's `cached_selected_job` already worked this way (an
 *     effect at line 1668 persists on every `selectedJob` change), so it
 *     swaps in directly. DashboardPage.jsx (`cached_candidates`, write at
 *     line 595) and UploadPage.jsx (`cached_candidates`, write at line
 *     311) are different: both persist ONLY inside the successful fetch's
 *     `.then`, not on every local `setCandidates` call. A straight
 *     `useState` -> `useSessionCache` swap on those two would start
 *     caching optimistic local edits (inline cell edits, status changes)
 *     and any filtered/partial candidate arrays, not just fetched data —
 *     a later phase should keep those two writes explicit (e.g. call
 *     `setValue` only from inside the fetch handler) rather than wiring
 *     every `setCandidates` call through this hook's setter.
 *   - JobsPage.jsx's candidates cache (`cached_job_candidates_${jobId}`)
 *     is not a simple "value changes -> persist" cache either: on
 *     `selectedJob` change it first synchronously hydrates `candidates`
 *     state from whatever is *currently* cached for the new job id (a
 *     "peek", so the UI isn't empty while the network request is in
 *     flight), and only afterwards kicks off `loadCandidates(jobId)` to
 *     fetch and overwrite it. Swapping to
 *     `useSessionCache(`cached_job_candidates_${jobId}`, [])` reproduces
 *     the hydrate-on-key-change part (see above), but the "fetch and
 *     overwrite" half still needs to stay page-owned — this hook does not
 *     perform any network requests.
 *
 * @template T
 * @param {string} key - The `sessionStorage` key to persist under. May change across renders to switch which cached value is read/written.
 * @param {T} initialValue - Value to use when nothing is cached yet (or parsing/storage fails).
 * @returns {[T, (next: T | ((prev: T) => T)) => void]} A `[value, setValue]` pair, analogous to `useState`.
 */
export function useSessionCache(key, initialValue) {
    const [value, setValueState] = useState(() => readFromStorage(key, initialValue));
    const valueRef = useRef(value);
    valueRef.current = value;

    // Re-sync when the cache key itself changes (e.g. switching selected job).
    useEffect(() => {
        const next = readFromStorage(key, initialValue);
        valueRef.current = next;
        setValueState(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const setValue = (next) => {
        const resolved = typeof next === 'function' ? next(valueRef.current) : next;
        valueRef.current = resolved;
        writeToStorage(key, resolved);
        setValueState(resolved);
    };

    return [value, setValue];
}

export default useSessionCache;
