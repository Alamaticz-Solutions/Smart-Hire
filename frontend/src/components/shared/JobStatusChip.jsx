// S5.2: job status color was computed inline in JobDetailPanel.jsx and
// JobsOverview.jsx with two near-identical, hardcoded, dark-only rgba
// palettes (ref G-6) - a badge that used the right --success-fg/--warning-fg/
// --danger-fg/--info-fg text tokens but a literal rgba() background/border
// that never adapted to light theme. This reuses the same four semantic
// pairs the --st-* candidate-status chips already use, so it's themed for
// free in both modes.
const STATUS_TOKEN = {
    'In-progress': 'success',
    'On-hold': 'warning',
    'Closed': 'danger',
}

const SIZES = {
    sm: { fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px' },
    md: { fontSize: '0.8rem', padding: '4px 10px', borderRadius: '20px' },
}

export default function JobStatusChip({ status, size = 'md' }) {
    const token = STATUS_TOKEN[status] || 'info'
    return (
        <span style={{
            ...SIZES[size],
            fontWeight: size === 'sm' ? 700 : 600,
            textTransform: 'uppercase',
            background: `var(--${token}-bg)`,
            color: `var(--${token}-fg)`,
            border: `1px solid var(--${token}-fg)`,
        }}>
            ● {status || 'In-progress'}
        </span>
    )
}
