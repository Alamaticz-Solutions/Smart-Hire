import { forwardRef } from 'react'

/**
 * Shared small-pill primitive (S10.6). Chip, SkillBadges, and
 * ExpandableCell each hand-rolled a near-identical badge - same radius,
 * same border/background opacity pattern, differing only in padding and
 * accent color. This is that one implementation; the three keep their own
 * files because each has different composition logic (a single value, a
 * list, an expand-on-click cell), but they all render through this.
 */
const TONES = {
    sky: { bg: 'rgba(var(--sky-rgb), 0.12)', border: 'rgba(var(--sky-rgb), 0.25)', color: 'var(--sky-dim)' },
    gold: { bg: 'rgba(var(--gold-rgb), 0.13)', border: 'rgba(var(--gold-rgb), 0.35)', color: 'var(--gold)' },
}

const SIZES = {
    sm: { padding: '1px 7px', fontSize: '0.73rem', lineHeight: '1.6' },
    md: { padding: '2px 7px', fontSize: '0.73rem', lineHeight: '1.7' },
}

const Tag = forwardRef(function Tag({ tone = 'sky', size = 'md', as: Component = 'span', style, children, ...rest }, ref) {
    const t = TONES[tone] || TONES.sky
    const s = SIZES[size] || SIZES.md
    return (
        <Component
            ref={ref}
            style={{
                background: t.bg, border: `1px solid ${t.border}`, borderRadius: 5,
                color: t.color, whiteSpace: 'nowrap', display: 'inline-block',
                ...s, ...style,
            }}
            {...rest}
        >{children}</Component>
    )
})

export default Tag
