// Was duplicated identically between JobsPage.jsx and UploadPage.jsx, differing
// only in a fixed offset UploadPage adds for its S.No/checkbox columns.
export function computeTableWidth(activeCols, baseOffset = 0) {
    let total = baseOffset
    activeCols.forEach(c => {
        const w = c.pct
        if (w && typeof w === 'string' && w.endsWith('px')) {
            total += parseInt(w, 10)
        } else {
            total += 120
        }
    })
    return total
}
