// Best-effort readable candidate name for display.
//
// The résumé parser frequently stores the raw attachment filename (often
// with a status prefix) as full_name, e.g.
//   "❌ Processing Failed: mail_69df9bb9_Sai_Yaswanth_Vutukuri_Pega_Developer_4.PDF"
//   "❌ Failed: mail_a92ca7c8_Prashant_jain_resume-1-2.pdf"
//   "Processing: John Doe.pdf"
// This derives something legible for the UI without touching the stored
// value. The real fix belongs in the backend parser.

const EMOJI_RE = new RegExp(
    '[\\u2190-\\u21ff\\u2300-\\u27bf\\u2b00-\\u2bff\\ufe0f]|[\\u{1F000}-\\u{1FAFF}]',
    'gu'
);

// A leading status word the parser prepends: "Processing Failed:", "Failed -",
// "Error:", "Parsing:", plain "Processing:". Consumed and discarded.
const STATUS_PREFIX_RE = /^(?:processing\s+failed|processing|parsing|failed|error)\s*[:\-–]\s*/i;
// The mailbox-ingest prefix "mail_<hex>_" — appears after the status prefix,
// not necessarily at string start, so it's stripped anywhere.
const MAIL_PREFIX_RE = /mail_[0-9a-f]{6,}_/i;
const FILE_EXT_RE = /\.(pdf|docx?|rtf|txt)$/i;
const HEX_TOKEN_RE = /^[0-9a-f]{6,}$/i;

const NOISE_WORDS = new Set([
    'resume', 'cv', 'profile', 'final', 'updated', 'new', 'copy', 'latest',
    'mail', 'professional', 'draft', 'doc', 'docx', 'pdf',
    'pega', 'developer', 'dev', 'engineer', 'consultant', 'analyst', 'lead',
    'senior', 'jr', 'sr', 'specialist', 'architect',
]);

export function displayCandidateName(raw) {
    if (raw == null) return '';
    let s = String(raw).replace(EMOJI_RE, '').trim();

    // Genuine "still processing" placeholder (NOT "Processing Failed: …").
    const processing = /^processing\s*[:\-–]/i.test(s);

    const hadStatusPrefix = STATUS_PREFIX_RE.test(s);
    s = s.replace(STATUS_PREFIX_RE, '');

    const wasFile = FILE_EXT_RE.test(s) || MAIL_PREFIX_RE.test(s);
    s = s.replace(MAIL_PREFIX_RE, '').replace(FILE_EXT_RE, '');

    if (hadStatusPrefix || wasFile || /[._]/.test(s)) {
        const parts = s
            .replace(/[._\-]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .filter(p => !HEX_TOKEN_RE.test(p));

        // keep the leading name-looking words, stop at the first role/noise token
        const kept = [];
        for (const p of parts) {
            if (NOISE_WORDS.has(p.toLowerCase())) break;
            kept.push(p);
        }
        s = kept.join(' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    if (!s) s = processing ? 'Processing…' : 'Unnamed candidate';
    return processing && s !== 'Processing…' ? `${s} (processing…)` : s;
}
