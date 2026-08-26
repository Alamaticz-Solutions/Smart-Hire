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
 * - Styling: kept DashboardPage's version (background/border opacity
 *   0.12/0.25, padding '1px 7px', fontSize 0.73rem, empty-state opacity
 *   0.35) over ChatPage's (0.15/0.3, '1px 6px', 0.72rem, 0.4) because it
 *   matches the values used by the sibling `Chip`/`ExpandableCell`
 *   components extracted alongside this one, making badge styling
 *   consistent across the whole app rather than per-page.
 */
export default function SkillBadges({ skills }) {
    if (!skills) return <span style={{ opacity: 0.35 }}>—</span>
    const list = String(skills).split(',').map(s => s.trim()).filter(Boolean)
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {list.map((s, i) => (
                <span key={i} style={{
                    background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                    borderRadius: 5, padding: '1px 7px', fontSize: '0.73rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', lineHeight: '1.6',
                }}>{s}</span>
            ))}
        </div>
    )
}
