// Was duplicated byte-for-byte between JobsPage.jsx and UploadPage.jsx's
// loadCols, keyed by a page-specific localStorage key ('hire_ai_job_col_order'
// vs 'hire_ai_col_order'). Only this self-contained "reorder by saved key
// order, '_actions' always last" step is shared — each page still builds its
// own `allLoaded` array (column widths, Jobs-only pinned name/ai_reason/status
// columns) before calling this.
export function applySavedColumnOrder(allLoaded, storageKey) {
    const savedOrder = localStorage.getItem(storageKey)
    if (savedOrder) {
        try {
            const keys = JSON.parse(savedOrder).filter(k => k !== '_actions')
            const ordered = []
            keys.forEach(k => {
                const found = allLoaded.find(c => c.key === k)
                if (found) ordered.push(found)
            })
            allLoaded.forEach(c => {
                if (!ordered.find(o => o.key === c.key)) {
                    if (c.key === '_actions') return
                    ordered.push(c)
                }
            })
            const actionsCol = allLoaded.find(c => c.key === '_actions')
            if (actionsCol) {
                ordered.push(actionsCol)
            }
            return ordered
        } catch (e) { }
    }
    return allLoaded
}
