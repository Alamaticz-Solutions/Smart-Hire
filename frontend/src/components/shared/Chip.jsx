/**
 * Shared "chip" pill used to render a single comma-split value (a skill,
 * certification, etc.) as a small rounded badge.
 *
 * Extracted from: JobsPage.jsx (`Chip`, ~line 14) and UploadPage.jsx
 * (`Chip`, ~line 12) — the two implementations were byte-identical, so this
 * is a straight dedup with no behavioral reconciliation needed.
 */
export default function Chip({ text }) {
    return (
        <span style={{
            background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
            borderRadius: 5, padding: '2px 7px', fontSize: '0.73rem',
            color: 'var(--sky-dim)', whiteSpace: 'nowrap', lineHeight: '1.7',
            display: 'inline-block', maxWidth: '100%', overflow: 'hidden',
            textOverflow: 'ellipsis',
        }}>{text}</span>
    )
}
