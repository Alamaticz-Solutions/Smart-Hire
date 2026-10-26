import apiClient from '../api/client'

/**
 * Inline cell-edit state handlers for the candidate tables. Was duplicated
 * near-verbatim between JobsPage.jsx and UploadPage.jsx: same numeric-field
 * whitelist (notice_period/availability_in_days -> int, total_experience/
 * pega_experience/cdh_exp -> float), same [HIDDEN] guard, same validation
 * toast text, same default PUT /api/candidates/{id} + optimistic
 * setCandidates update.
 *
 * Two things that differed between the pages are threaded through as
 * options rather than hardcoded here, so this hook has no page-specific
 * behavior baked in:
 *   - JobsPage blocks all editing for external users (`blockAll`) and has
 *     an `ai_reason` column that PUTs to a job-scoped endpoint instead of
 *     the default candidate one (`fieldOverrides`).
 *   - The two pages' certifications-permission toast text differs by one
 *     word ("Only Admins" vs "Only Admins and HR users") - `certificationsMessage`.
 *
 * @param {Object} params
 * @param {Array} params.candidates
 * @param {Function} params.setCandidates
 * @param {{row:number,col:string}|null} params.editCell
 * @param {Function} params.setEditCell
 * @param {string} params.editVal
 * @param {Function} params.setEditVal
 * @param {Function} params.showToast
 * @param {boolean} params.isAdmin
 * @param {boolean} [params.blockAll] - When true, startEdit is a no-op (JobsPage's is_external guard).
 * @param {string} [params.certificationsMessage]
 * @param {Object.<string, (candidate: object, finalVal: any) => Promise>} [params.fieldOverrides] - column key -> async save function, used instead of the default PUT /api/candidates/{id}.
 */
export function useInlineCellEdit({
    candidates, setCandidates, editCell, setEditCell, editVal, setEditVal, showToast,
    isAdmin, blockAll = false, certificationsMessage = "Only Admins can view or edit certifications.",
    fieldOverrides = {},
}) {
    const startEdit = (ri, col, val) => {
        if (blockAll) return;
        if (col === 'certifications' && !isAdmin) {
            showToast(certificationsMessage, "error");
            return;
        }
        if (val === '[HIDDEN]') {
            showToast("This field is hidden by the administrator.", "error");
            return;
        }
        setEditCell({ row: ri, col });
        setEditVal(String(val || ''));
    }

    const saveEdit = async (ri) => {
        const c = candidates[ri]; if (!c?.id) { setEditCell(null); return }

        let finalVal = editVal;
        if (editCell.col === 'notice_period' || editCell.col === 'availability_in_days') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast(`${editCell.col} must be a number`, 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseInt(finalVal, 10) : '';
        }
        if (editCell.col === 'total_experience' || editCell.col === 'pega_experience' || editCell.col === 'cdh_exp') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast('Experience must be a number', 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseFloat(finalVal) : '';
        }

        try {
            const override = fieldOverrides[editCell.col];
            if (override) {
                await override(c, finalVal);
            } else {
                await apiClient.put(`/api/candidates/${c.id}`, { [editCell.col]: finalVal });
            }
            setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: finalVal } : row));
            showToast('Saved!');
        } catch (e) { showToast(e.response?.data?.detail || 'Save failed', 'error') }
        setEditCell(null);
    }

    return { startEdit, saveEdit };
}
