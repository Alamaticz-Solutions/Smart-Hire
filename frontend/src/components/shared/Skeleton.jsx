import React from 'react'

/**
 * G-21: one shimmering block primitive, composed per page into a
 * placeholder that roughly mirrors the real layout — replaces the
 * Dashboard's page-replacing spinner, Admin's "Loading data..." text,
 * and Upload's mismatched "Refreshing..."/"Loading…" strings.
 */
export function SkeletonBlock({ width = '100%', height = 16, radius = 6, style }) {
    return (
        <div
            className="skeleton-block"
            role="presentation"
            style={{ width, height, borderRadius: radius, ...style }}
        />
    )
}

/** A row of KPI-card-shaped placeholders, for Dashboard. */
export function SkeletonKPIRow({ count = 4 }) {
    return (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="card" style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SkeletonBlock width={36} height={36} radius={8} />
                    <SkeletonBlock width="55%" height={24} />
                    <SkeletonBlock width="75%" height={12} />
                </div>
            ))}
        </div>
    )
}

/** A stack of table-row-shaped placeholder lines, for any list/table view. */
export function SkeletonRows({ count = 6, height = 18 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonBlock key={i} height={height} width={i % 3 === 2 ? '70%' : '100%'} />
            ))}
        </div>
    )
}
