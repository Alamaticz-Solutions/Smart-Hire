import Tag from './Tag'

/**
 * Renders a comma-separated string as a row of small skill badges.
 *
 * Extracted from: DashboardPage.jsx (`SkillBadges({ skills })`, ~line 552)
 * and ChatPage.jsx (`SkillBadges({ value })`, ~line 15).
 *
 * Reconciliation:
 * - Prop name: kept `skills` (DashboardPage's name) over ChatPage's generic
 *   `value` — it documents what the prop actually holds and matches the
 *   naming used elsewhere in this codebase (e.g. `candidate.skills`).
 * - Styling: now renders through the shared <Tag> primitive (S10.6) at
 *   size="sm", which matches the values this file already used.
 */
export default function SkillBadges({ skills }) {
    if (!skills) return <span style={{ opacity: 0.35 }}>—</span>
    const list = String(skills).split(',').map(s => s.trim()).filter(Boolean)
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {list.map((s, i) => <Tag key={i} size="sm">{s}</Tag>)}
        </div>
    )
}
