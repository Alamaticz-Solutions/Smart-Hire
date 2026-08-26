import { useState } from 'react';

/**
 * Shared base column widths for the candidate table, keyed by column key.
 *
 * This is the intersection of `BASE_WIDTHS` as it exists independently in
 * JobsPage.jsx (around line 1340) and UploadPage.jsx (around line 120).
 * The two copies were near-identical but not byte-identical:
 *   - JobsPage's copy additionally defines `ai_reason: '350px'` and
 *     `source: '130px'` (Jobs-only columns — AI match reasoning and
 *     candidate source, not shown on the Upload table).
 *   - UploadPage's copy additionally defines `sender_email: '220px'`
 *     (an Upload-only column for the email a resume was received from).
 * Those page-specific entries are NOT baked into this shared default map
 * so that neither page silently gains a width entry for a column it
 * doesn't render. Pass them via the `extraWidths` argument to
 * `useColumnConfig` instead (see below).
 */
export const SHARED_BASE_WIDTHS = {
    full_name: '180px', total_experience: '150px', pega_experience: '150px',
    cdh_exp: '140px', ctc: '120px', expected_ctc: '120px', percentage_hike: '140px',
    candidate_interview_status: '180px', candidate_status: '150px', availability_in_days: '140px', notice_period: '120px',
    phone: '140px', email: '220px', linkedin: '140px', current_location: '140px',
    pref_locations: '150px', current_organization: '180px', current_client: '160px',
    domain: '130px', tier: '100px', certification_version: '120px',
    skills: '220px', certifications: '200px', notescomments: '220px',
};

/** Shared `<th>` cell style — identical between JobsPage.jsx and UploadPage.jsx. */
export const TH = {
    padding: '11px 10px',
    textAlign: 'left',
    fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.73rem',
    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05rem',
    borderBottom: '2px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.97)',
    /* prevent th text from overflowing into next header */
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
};

/** Shared `<td>` base style — identical between JobsPage.jsx and UploadPage.jsx. */
export const TD_BASE = {
    padding: '10px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid rgba(var(--sky-rgb), 0.07)',
    /* ALL cells clip — nothing bleeds into adjacent column */
    overflow: 'hidden',
};

/** Default width used for any column key with no explicit entry in the widths map. */
const DEFAULT_COLUMN_WIDTH = '120px';

/**
 * Encapsulates the candidate-table column *appearance and visibility*
 * concerns that were duplicated between JobsPage.jsx and UploadPage.jsx:
 * the base width lookup table, the shared `<th>`/`<td>` style objects, and
 * the `toggleColumnVisibility` / `handleShowAllColumns` / `handleHideAllColumns`
 * handlers (previously copy-pasted verbatim in both files, operating on a
 * `hiddenColumnKeys` piece of state and a `cols` array of `{ key, label, ... }`
 * column descriptors owned by the page).
 *
 * Column *ordering* (drag-to-reorder) is intentionally NOT handled here —
 * see `useDraggableColumns`. The page itself owns the `cols`/`setCols`
 * state (the ordered array of column descriptors) and passes it into both
 * hooks: `columns` here (read-only, to compute "hide all") and
 * `useDraggableColumns(columns, setColumns)` there (read/write, to reorder
 * it). Neither hook owns that array itself.
 *
 * @param {Array<{ key: string }>} columns - The current (ordered) list of column descriptors, as rendered by the page (e.g. from `useDraggableColumns`).
 * @param {Object.<string, string>} [extraWidths] - Page-specific width overrides/additions merged on top of the shared defaults (e.g. `{ ai_reason: '350px', source: '130px' }` for JobsPage, or `{ sender_email: '220px' }` for UploadPage).
 * @returns {{
 *   hiddenColumnKeys: string[],
 *   setHiddenColumnKeys: Function,
 *   isColumnHidden: (key: string) => boolean,
 *   toggleColumnVisibility: (key: string) => void,
 *   handleShowAllColumns: () => void,
 *   handleHideAllColumns: () => void,
 *   getColumnWidth: (key: string) => string,
 *   BASE_WIDTHS: Object.<string, string>,
 *   TH: Object,
 *   TD_BASE: Object,
 * }}
 */
export function useColumnConfig(columns, extraWidths = {}) {
    const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);

    const BASE_WIDTHS = { ...SHARED_BASE_WIDTHS, ...extraWidths };

    const isColumnHidden = (key) => hiddenColumnKeys.includes(key);

    const toggleColumnVisibility = (key) => {
        setHiddenColumnKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const handleShowAllColumns = () => {
        setHiddenColumnKeys([]);
    };

    // Matches the original behavior exactly: '_actions' and 'full_name' are
    // never hidden, since '_actions' is the row-actions column and
    // 'full_name' is the primary identifying column for a row.
    const handleHideAllColumns = () => {
        setHiddenColumnKeys((columns || []).filter(c => c.key !== '_actions' && c.key !== 'full_name').map(c => c.key));
    };

    const getColumnWidth = (key) => BASE_WIDTHS[key] || DEFAULT_COLUMN_WIDTH;

    return {
        hiddenColumnKeys,
        setHiddenColumnKeys,
        isColumnHidden,
        toggleColumnVisibility,
        handleShowAllColumns,
        handleHideAllColumns,
        getColumnWidth,
        BASE_WIDTHS,
        TH,
        TD_BASE,
    };
}

export default useColumnConfig;
