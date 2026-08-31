// Best-effort readable candidate name for display.
//
// Résumé parsing sometimes falls back to the raw attachment filename
// (e.g. "mail_c05627fb_Sindhuja_Karamcheti_Pega_developer.pdf" or a
// "Processing: <file>" placeholder). This derives something legible for
// the UI without touching the stored value. The real fix belongs in the
// backend parser.

const EMOJI_RE = new RegExp(
    '[\\u2190-\\u21ff\\u2300-\\u27bf\\u2b00-\\u2bff\\ufe0f]|[\\u{1F000}-\\u{1FAFF}]',
    'gu'
);

const NOISE_WORDS = new Set([
    'resume', 'cv', 'profile', 'final', 'updated', 'new', 'copy', 'latest',
    'pega', 'developer', 'dev', 'engineer', 'consultant', 'analyst', 'lead',
    'senior', 'jr', 'sr', 'doc', 'docx', 'pdf',
]);

export function displayCandidateName(raw) {
    if (raw == null) return '';
    let s = String(raw).replace(EMOJI_RE, '').trim();

    // "Processing: <file>" placeholder -> keep the "Processing" hint only
    const processing = /^processing[:\s-]/i.test(s);
    s = s.replace(/^processing[:\s-]+/i, '');

    // Looks like a filename? (has an extension, or the mail_<hex>_ prefix)
    const looksLikeFile = /\.(pdf|docx?|rtf|txt)$/i.test(s) || /^mail_[0-9a-f]{6,}_/i.test(s);
    if (looksLikeFile) {
        s = s
            .replace(/\.(pdf|docx?|rtf|txt)$/i, '')
            .replace(/^mail_[0-9a-f]{6,}_/i, '')
            .replace(/[._-]+/g, ' ')
            .trim();

        // drop trailing role/noise tokens, keep the leading name-looking words
        const parts = s.split(/\s+/).filter(Boolean);
        const kept = [];
        for (const p of parts) {
            if (NOISE_WORDS.has(p.toLowerCase())) break;
            kept.push(p);
        }
        s = (kept.length ? kept : parts.slice(0, 2)).join(' ');
        s = s.replace(/\b\w/g, c => c.toUpperCase());
    }

    if (!s) s = 'Unnamed candidate';
    return processing ? `${s} (processing…)` : s;
}
