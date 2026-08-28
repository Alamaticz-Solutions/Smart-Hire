import Tag from './Tag'

/**
 * Shared "chip" pill used to render a single comma-split value (a skill,
 * certification, etc.) as a small rounded badge.
 *
 * Extracted from: JobsPage.jsx (`Chip`, ~line 14) and UploadPage.jsx
 * (`Chip`, ~line 12) — the two implementations were byte-identical, so this
 * is a straight dedup with no behavioral reconciliation needed. Now renders
 * through the shared <Tag> primitive (S10.6).
 */
export default function Chip({ text }) {
    return (
        <Tag style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</Tag>
    )
}
