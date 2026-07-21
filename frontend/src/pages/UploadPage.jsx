import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useOutletContext } from 'react-router-dom'
import axios from 'axios'
import { UploadCloud, Trash2, CheckCircle, FileText, Search, Plus, Filter, Loader, RefreshCw, Download, Upload, X, Check, Eye, Link } from 'lucide-react'
import { exportToExcel, formatCandidatesForExcel } from '../utils/excelUtils'

const API_URL = import.meta.env.VITE_API_URL || '';
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/* ─── Single chip ─────────────────────────────────────────────────────────── */
function Chip({ text }) {
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

/* ─── Collapsible popup cell ──────────────────────────────────────────────── */
function ExpandableCell({ value, onEdit }) {
    const [open, setOpen] = useState(false)
    const btnRef = useRef(null)

    const items = value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []

    const openPopup = (e) => {
        e.stopPropagation()
        setOpen(true)
    }

    if (items.length === 0) return <span style={{ opacity: 0.35 }}>—</span>

    return (
        <>
            {/* Always inside the td — compact single row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                <span style={{
                    background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                    borderRadius: 5, padding: '2px 7px', fontSize: '0.73rem',
                    color: 'var(--sky-dim)', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', lineHeight: '1.7', maxWidth: 'calc(100% - 64px)',
                    display: 'inline-block',
                }}>{items[0]}</span>

                {items.length > 1 && (
                    <span ref={btnRef}
                        onClick={openPopup}
                        style={{
                            background: 'rgba(var(--gold-rgb), 0.13)', border: '1px solid rgba(var(--gold-rgb), 0.35)',
                            borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem',
                            color: 'var(--gold)', cursor: 'pointer', whiteSpace: 'nowrap',
                            lineHeight: '1.7', fontFamily: 'var(--fh)', fontWeight: 700,
                            flexShrink: 0,
                        }}>
                        +{items.length - 1}
                    </span>
                )}
            </div>

            {/* Centered Modal Popup */}
            {open && (
                <div 
                    onClick={() => setOpen(false)}
                    className="modal-overlay"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '16px 20px', width: 340, maxWidth: '90%',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{
                                fontSize: '0.78rem', color: 'var(--gold)', fontFamily: 'var(--fh)',
                                fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05rem'
                            }}>
                                All ({items.length})
                            </span>
                            <button onClick={() => setOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                            {items.map((s, i) => <Chip key={i} text={s} />)}
                        </div>

                        <div style={{
                            marginTop: 12, borderTop: '1px solid var(--border)',
                            paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', opacity: 0.7 }}>
                                Double-click cell to edit full text
                            </span>
                            <button onClick={() => { setOpen(false); onEdit() }}
                                style={{
                                    background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                    borderRadius: 6, color: 'var(--gold)', fontSize: '0.75rem', cursor: 'pointer',
                                    padding: '4px 12px', fontFamily: 'var(--fh)', fontWeight: 700
                                }}>
                                ✏ Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

/* ─── Column config ───────────────────────────────────────────────────────── */
const BASE_WIDTHS = {
    full_name: '180px', total_experience: '150px', pega_experience: '150px',
    cdh_exp: '140px', ctc: '120px', expected_ctc: '120px', percentage_hike: '140px',
    candidate_interview_status: '180px', candidate_status: '150px', availability_in_days: '140px', notice_period: '120px',
    phone: '140px', email: '220px', sender_email: '220px', linkedin: '140px', current_location: '140px',
    pref_locations: '150px', current_organization: '180px', current_client: '160px',
    domain: '130px', tier: '100px', certification_version: '120px',
    skills: '220px', certifications: '200px', notescomments: '220px'
}

const TH = {
    padding: '11px 10px',
    textAlign: 'left',
    fontFamily: 'var(--fh)', fontWeight: 800, fontSize: '0.73rem',
    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05rem',
    borderBottom: '2px solid var(--border)', background: 'rgba(var(--navy-rgb), 0.97)',
    /* prevent th text from overflowing into next header */
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
}

const TD_BASE = {
    padding: '10px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid rgba(var(--sky-rgb), 0.07)',
    /* ALL cells clip — nothing bleeds into adjacent column */
    overflow: 'hidden',
}

const THEME_PRESETS = {
  professional: {
    name: "Professional (Default)",
    subject: "Re: {subject} (Ref: {ref})",
    body_missing: `Dear {candidate_name},

Thank you for your interest in Alamaticz Solutions and for submitting your application.

We appreciate the time you have taken to apply for this opportunity. To help us evaluate your profile further, kindly share the following details:

{missing_fields}

Once we receive the above information, our recruitment team will review your profile and get back to you regarding the next steps in the selection process.

We look forward to hearing from you.

Best regards,

HR Team
Alamaticz Solutions`,
    body_complete: `Dear {candidate_name},

Thank you for your interest in Alamaticz Solutions and for submitting your application.

We appreciate the time you have taken to apply for this opportunity. Our recruitment team will review your profile and get back to you regarding the next steps in the selection process.

Best regards,

HR Team
Alamaticz Solutions`
  },
  creative: {
    name: "Creative / Enthusiastic",
    subject: "Excited to connect! Re: {subject} (Ref: {ref})",
    body_missing: `Hi {candidate_name}!

Thanks for reaching out and sharing your resume with us. We love connecting with talented people!

We are eager to dive into your application, but we are missing a few details. Could you please share the following with us?

{missing_fields}

As soon as we get these details, we'll review your profile and get back to you regarding the next steps.

Can't wait to hear back from you!

Cheers,

The Talent Team
Alamaticz Solutions`,
    body_complete: `Hi {candidate_name}!

Thanks for reaching out and sharing your application with us!

We have everything we need. Our team is already looking over your profile, and we'll be in touch soon with the next steps.

Have a fantastic day!

Cheers,

The Talent Team
Alamaticz Solutions`
  },
  warm: {
    name: "Warm / Friendly",
    subject: "Thank you for applying! Re: {subject} (Ref: {ref})",
    body_missing: `Hello {candidate_name},

We hope you are having a wonderful day! Thank you so much for taking the time to apply to our team.

To help us get a better picture of your experience and fit for the role, could you please help us with these remaining details?

{missing_fields}

We really appreciate your support and look forward to reviewing your application as soon as we receive this.

Wishing you all the best,

Your Friends at HR
Alamaticz Solutions`,
    body_complete: `Hello {candidate_name},

We hope you are doing well! Thank you so much for sending over your application.

This is just a quick note to let you know we've received all your information. Our team will review everything carefully and get back to you soon.

Take care,

Your Friends at HR
Alamaticz Solutions`
  }
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function UploadPage() {
    const { user } = useOutletContext()
    const [candidates, setCandidates] = useState([])
    const [progress, setProgress] = useState([])
    const [toast, setToast] = useState(null)
    const [editCell, setEditCell] = useState(null)
    const [editVal, setEditVal] = useState('')
    const [cols, setCols] = useState([])
    const [showAddCol, setShowAddCol] = useState(false)
    const [showAddCandidate, setShowAddCandidate] = useState(false)
    const [newCandidateForm, setNewCandidateForm] = useState({})
    const [viewingPdf, setViewingPdf] = useState(null)
    const [selectedCandidateForDetails, setSelectedCandidateForDetails] = useState(null)
    const [showFilter, setShowFilter] = useState(false)
    const [filters, setFilters] = useState({ minTotalExp: '', minPegaExp: '', certs: [] })
    const [customFilters, setCustomFilters] = useState([])
    const [columnFilters, setColumnFilters] = useState({})
     const [activeTab, setActiveTab] = useState('all') // 'all' or 'qualified'
    const [newColForm, setNewColForm] = useState({ label: '', desc: '' })
    
    const [showIntegrations, setShowIntegrations] = useState(false)
    const [integrationsTab, setIntegrationsTab] = useState('mail')
    const [previewType, setPreviewType] = useState('missing')
    const [integrationsSettings, setIntegrationsSettings] = useState({
        email_enabled: 0, imap_host: 'imap.gmail.com', imap_port: 993,
        smtp_host: 'smtp.gmail.com', smtp_port: 587, email_user: '',
        email_pass: '', keywords: 'resume,alamaticz,solution,job', drive_enabled: 0,
        reply_theme: 'professional',
        reply_subject: '',
        reply_body_missing: '',
        reply_body_complete: '',
        gdrive_client_id: '',
        gdrive_client_secret: '',
        gdrive_refresh_token: '',
        gdrive_folder_id: '',
        gdrive_email: ''
    })
    const [testStatus, setTestStatus] = useState({ status: 'idle', message: '' })
    const [testingConnection, setTestingConnection] = useState(false)
    const [gdriveAuthCode, setGdriveAuthCode] = useState('')
    const [exchangingGdriveCode, setExchangingGdriveCode] = useState(false)

    const handleGenerateGdriveAuthUrl = () => {
        const clientId = integrationsSettings.gdrive_client_id?.trim();
        if (!clientId) {
            alert('Please enter a Google Client ID first.');
            return;
        }
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
            `client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent('http://localhost')}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}` +
            `&access_type=offline` +
            `&prompt=consent`;
            
        window.open(authUrl, '_blank');
    };

    const handleExchangeGdriveCode = async () => {
        const clientId = integrationsSettings.gdrive_client_id?.trim();
        const clientSecret = integrationsSettings.gdrive_client_secret?.trim();
        if (!clientId || !clientSecret) {
            alert('Please enter Client ID and Client Secret first.');
            return;
        }
        if (!gdriveAuthCode.trim()) {
            alert('Please paste the authorization code or redirect URL first.');
            return;
        }
        
        setExchangingGdriveCode(true);
        try {
            const res = await axios.post(`${BACKEND_URL}/api/integrations/gdrive/exchange`, {
                client_id: clientId,
                client_secret: clientSecret,
                code: gdriveAuthCode.trim()
            }, {
                headers: { 'x-user-username': user?.username }
            });
            
            const { refresh_token, email } = res.data;
            setIntegrationsSettings(prev => ({
                ...prev,
                gdrive_refresh_token: refresh_token,
                gdrive_email: email
            }));
            setGdriveAuthCode('');
            showToast(`Connected successfully to ${email}!`, 'success');
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to exchange authorization code.');
        } finally {
            setExchangingGdriveCode(false);
        }
    };

    const handleDisconnectGdrive = () => {
        if (window.confirm('Are you sure you want to disconnect this Google Drive account?')) {
            setIntegrationsSettings(prev => ({
                ...prev,
                gdrive_refresh_token: '',
                gdrive_email: '',
                drive_enabled: 0
            }));
            showToast('Google Drive account disconnected. Make sure to save settings to persist.', 'info');
        }
    };

    const handleThemeChange = (newTheme) => {
        if (newTheme !== 'custom') {
            const preset = THEME_PRESETS[newTheme];
            setIntegrationsSettings(prev => ({
                ...prev,
                reply_theme: newTheme,
                reply_subject: preset.subject,
                reply_body_missing: preset.body_missing,
                reply_body_complete: preset.body_complete
            }));
        } else {
            setIntegrationsSettings(prev => {
                const currentPreset = THEME_PRESETS[prev.reply_theme] || THEME_PRESETS.professional;
                return {
                    ...prev,
                    reply_theme: 'custom',
                    reply_subject: prev.reply_subject || currentPreset.subject,
                    reply_body_missing: prev.reply_body_missing || currentPreset.body_missing,
                    reply_body_complete: prev.reply_body_complete || currentPreset.body_complete
                };
            });
        }
    }

    const getPreviewText = (subjectTpl, bodyTpl) => {
        const candidateName = "Somasekhar Kundurthi";
        const subjectVal = "React Developer Application";
        const refVal = "CAND-407";
        const missingFields = `* Total years of experience\n* Current CTC\n* Expected CTC`;

        let subject = (subjectTpl || "Re: {subject} (Ref: {ref})")
            .replace(/{subject}/g, subjectVal)
            .replace(/{ref}/g, refVal);

        let body = (bodyTpl || "")
            .replace(/{candidate_name}/g, candidateName)
            .replace(/{missing_fields}/g, missingFields)
            .replace(/{subject}/g, subjectVal)
            .replace(/{ref}/g, refVal);

        return { subject, body };
    }
    
    const [showColVisibility, setShowColVisibility] = useState(false)
    const [hiddenColumnKeys, setHiddenColumnKeys] = useState([])
    const [draggedColKey, setDraggedColKey] = useState(null)
    const [dragOverColKey, setDragOverColKey] = useState(null)
    const [loadingCandidates, setLoadingCandidates] = useState(false)

    const toggleColumnVisibility = (key) => {
        setHiddenColumnKeys(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        )
    }

    const handleShowAllColumns = () => {
        setHiddenColumnKeys([])
    }

    const handleHideAllColumns = () => {
        setHiddenColumnKeys(cols.filter(c => c.key !== '_actions' && c.key !== 'full_name').map(c => c.key))
    }

    const handleDragStart = (e, key) => {
        setDraggedColKey(key);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
    };

    const handleDragOver = (e, key) => {
        if (key === '_actions') return;
        e.preventDefault();
    };

    const handleDragEnter = (e, key) => {
        if (key === '_actions') return;
        setDragOverColKey(key);
    };

    const handleDragEnd = () => {
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    const handleDrop = (e, targetKey) => {
        e.preventDefault();
        if (!draggedColKey || draggedColKey === targetKey || targetKey === '_actions' || draggedColKey === '_actions') {
            setDraggedColKey(null);
            setDragOverColKey(null);
            return;
        }

        const dragIdx = cols.findIndex(c => c.key === draggedColKey);
        const targetIdx = cols.findIndex(c => c.key === targetKey);

        if (dragIdx !== -1 && targetIdx !== -1) {
            const updatedCols = [...cols];
            const [draggedItem] = updatedCols.splice(dragIdx, 1);
            updatedCols.splice(targetIdx, 0, draggedItem);
            setCols(updatedCols);
        }
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    useEffect(() => {
        if (cols.length > 0) {
            localStorage.setItem('hire_ai_col_order', JSON.stringify(cols.map(c => c.key).filter(k => k !== '_actions')))
        }
    }, [cols])

    useEffect(() => {
        if (!showColVisibility) return;
        const clickAway = () => setShowColVisibility(false);
        const timer = setTimeout(() => {
            document.addEventListener('click', clickAway);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', clickAway);
        };
    }, [showColVisibility]);

    const activeCols = cols.filter(c => c.key === '_actions' || !hiddenColumnKeys.includes(c.key))

    const PEGA_CERTS = ['CSA', 'CSSA', 'LSA', 'CPDC']

    const toggleCert = (cert) => {
        setFilters(prev => ({
            ...prev,
            certs: prev.certs.includes(cert) 
                ? prev.certs.filter(c => c !== cert) 
                : [...prev.certs, cert]
        }))
    }

    const filteredCandidates = candidates.filter(candidate => {
        // Tab Filtering
        if (activeTab === 'qualified' && candidate.is_qualified !== 1) return false;

        const tExp = parseFloat(candidate.total_experience) || 0;
        const pExp = parseFloat(candidate.pega_experience) || 0;
        
        if (filters.minTotalExp !== '' && tExp < parseFloat(filters.minTotalExp)) return false;
        if (filters.minPegaExp !== '' && pExp < parseFloat(filters.minPegaExp)) return false;
        
        if (filters.certs.length > 0) {
            const cStr = (candidate.certifications || '').toLowerCase();
            const hasCerts = filters.certs.some(cert => cStr.includes(cert.toLowerCase()));
            if (!hasCerts) return false;
        }
        
        // Custom Filters
        for (const cf of customFilters) {
            if (cf.col && cf.val) {
                const cVal = String(candidate[cf.col] || '').toLowerCase();
                if (!cVal.includes(cf.val.toLowerCase())) return false;
            }
        }

        // Inline Column Filters
        for (const [colKey, filterVal] of Object.entries(columnFilters)) {
            if (filterVal) {
                const cVal = String(candidate[colKey] || '').toLowerCase();
                if (!cVal.includes(filterVal.toLowerCase())) return false;
            }
        }
        
        return true;
    });

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
    const load = () => {
        setLoadingCandidates(true);
        return axios.get(`${API_URL}/api/candidates`)
            .then(r => setCandidates(r.data))
            .catch(err => {
                console.error("Failed to load candidates", err);
                showToast("Failed to load candidates", "error");
            })
            .finally(() => setLoadingCandidates(false));
    }
    const handleAddCandidateSubmit = async () => {
        if (!newCandidateForm.full_name || !newCandidateForm.full_name.trim()) {
            alert("Candidate Name is required!");
            return;
        }
        try {
            await axios.post(`${API_URL}/api/candidates`, newCandidateForm);
            showToast("Candidate added successfully!");
            setShowAddCandidate(false);
            load();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to add candidate");
        }
    };
    const loadCols = () => axios.get(`${API_URL}/api/columns`).then(r => {
        const base = (r.data.base || []).map(c => ({ key: c.col_key, label: c.col_label, pct: BASE_WIDTHS[c.col_key] || '120px', col_key: c.col_key, col_label: c.col_label }))
        const custom = (r.data.custom || []).map(c => ({ key: c.col_key, label: c.col_label, pct: '120px', col_key: c.col_key, col_label: c.col_label, isCustom: true }))
        const allLoaded = [...base, ...custom, { key: '_actions', label: 'Actions', pct: '100px' }]
        
        const savedOrder = localStorage.getItem('hire_ai_col_order')
        if (savedOrder) {
            try {
                const keys = JSON.parse(savedOrder).filter(k => k !== '_actions')
                const ordered = []
                keys.forEach(k => {
                    const found = allLoaded.find(c => c.key === k)
                    if (found) ordered.push(found)
                })
                allLoaded.forEach(c => {
                    if (!ordered.find(o => o.key === c.key)) {
                        if (c.key === '_actions') return
                        ordered.push(c)
                    }
                })
                const actionsCol = allLoaded.find(c => c.key === '_actions')
                if (actionsCol) {
                    ordered.push(actionsCol)
                }
                setCols(ordered)
                return
            } catch (e) { }
        }
        setCols(allLoaded)
    }).catch(() => { })

    const fetchIntegrationsSettings = useCallback(async () => {
        try {
            const res = await axios.get(`${BACKEND_URL}/api/integrations`, {
                headers: { 'x-user-username': user?.username }
            })
            setIntegrationsSettings(res.data)
        } catch (err) {
            console.error('Error fetching integrations settings:', err)
        }
    }, [user?.username])

    useEffect(() => {
        if (showIntegrations && user?.role === 'admin') {
            fetchIntegrationsSettings()
        }
    }, [showIntegrations, fetchIntegrationsSettings, user])

    const runConnectionTest = async () => {
        setTestingConnection(true)
        setTestStatus({ status: 'testing', message: 'Testing IMAP connection...' })
        try {
            const res = await axios.get(`${BACKEND_URL}/api/integrations/status`, {
                headers: { 'x-user-username': user?.username }
            })
            setTestStatus({ status: res.data.status, message: res.data.message })
        } catch (err) {
            setTestStatus({ status: 'error', message: 'Failed to run connection test: ' + (err.response?.data?.detail || err.message) })
        } finally {
            setTestingConnection(false)
        }
    }

    const saveIntegrationsSettings = async () => {
        try {
            await axios.post(`${BACKEND_URL}/api/integrations`, integrationsSettings, {
                headers: { 'x-user-username': user?.username }
            })
            showToast("Integration settings saved successfully!", "success")
            setShowIntegrations(false)
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to save integration settings")
        }
    }

    useEffect(() => {
        load();
        loadCols();
        
        // Poll for new candidates automatically every 20 seconds
        const interval = setInterval(() => {
            load();
        }, 20000);
        
        return () => clearInterval(interval);
    }, [])

    // Polling mechanism to auto-refresh the table when resumes are processing in the background
    useEffect(() => {
        const hasProcessing = candidates.some(c => c.full_name && c.full_name.includes('Processing'));
        if (hasProcessing) {
            const timer = setInterval(() => {
                load();
            }, 3000);
            return () => clearInterval(timer);
        }
    }, [candidates]);

    // Polling mechanism to auto-refresh the table for 15 seconds after any file upload completes (e.g. Excel)
    useEffect(() => {
        const anyDone = progress.some(p => p.status === 'done');
        if (anyDone) {
            const timer = setInterval(() => {
                load();
            }, 3000);
            const timeout = setTimeout(() => {
                clearInterval(timer);
            }, 15000);
            return () => {
                clearInterval(timer);
                clearTimeout(timeout);
            };
        }
    }, [progress]);

    const handleDeleteCol = async (col_key, col_label) => {
        const label = col_label || col_key;
        if (!window.confirm(`Are you sure you want to delete the "${label}" column?`)) return
        try {
            await axios.delete(`${API_URL}/api/columns/${col_key}`)
            showToast('Column deleted')
            loadCols()
        } catch (e) { showToast(e.response?.data?.detail || 'Delete failed', 'error') }
    }

    const handleAddCol = async () => {
        if (!newColForm.label || !newColForm.desc) return showToast('Please fill all fields', 'error')
        try {
            const col_key = newColForm.label.replace(/[^a-zA-Z0-9_]/g, '').replace(/\s+/g, '_').toLowerCase()
            await axios.post(`${API_URL}/api/columns`, { col_key, col_label: newColForm.label, description: newColForm.desc })
            setShowAddCol(false)
            setNewColForm({ label: '', desc: '' })
            loadCols()
            showToast('Column added!')
        } catch (e) { showToast(e.response?.data?.detail || 'Add failed', 'error') }
    }

    const onDrop = useCallback(async (files) => {
        if (!files.length) return
        setProgress(files.map(f => ({ name: f.name, status: 'pending', percent: 0 })))
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData(); fd.append('file', files[i])
            setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'processing', percent: 10 } : x))
            try {
                await axios.post(`${API_URL}/api/upload`, fd, {
                    onUploadProgress: ev => {
                        const pct = Math.round((ev.loaded / ev.total) * 70)
                        setProgress(p => p.map((x, idx) => idx === i ? { ...x, percent: 10 + pct } : x))
                    }
                })
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'done', percent: 100 } : x))
            } catch {
                setProgress(p => p.map((x, idx) => idx === i ? { ...x, status: 'error', percent: 0 } : x))
            }
        }
        load()
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 
            'application/pdf': ['.pdf'], 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv']
        },
        multiple: true,
    })

    const startEdit = (ri, col, val) => {
        const isAdmin = user?.role === 'admin' || user?.is_admin === 1 || user?.is_hr === 1;
        if (col === 'certifications' && !isAdmin) {
            showToast("Only Admins and HR users can view or edit certifications.", "error");
            return;
        }
        if (val === '[HIDDEN]') {
            showToast("This field is hidden by the administrator.", "error");
            return;
        }
        setEditCell({ row: ri, col });
        setEditVal(String(val || ''));
    }
    const saveEdit = async (ri) => {
        const c = candidates[ri]; if (!c?.id) { setEditCell(null); return }
        
        let finalVal = editVal;
        if (editCell.col === 'notice_period' || editCell.col === 'availability_in_days') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast(`${editCell.col} must be a number`, 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseInt(finalVal, 10) : '';
        }
        if (editCell.col === 'total_experience' || editCell.col === 'pega_experience' || editCell.col === 'cdh_exp') {
            if (finalVal !== '' && isNaN(finalVal)) {
                showToast('Experience must be a number', 'error');
                return;
            }
            finalVal = finalVal !== '' ? parseFloat(finalVal) : '';
        }

        try {
            await axios.put(`${API_URL}/api/candidates/${c.id}`, { [editCell.col]: finalVal })
            setCandidates(prev => prev.map((row, i) => i === ri ? { ...row, [editCell.col]: finalVal } : row))
            showToast('Saved!')
        } catch (e) { showToast(e.response?.data?.detail || 'Save failed', 'error') }
        setEditCell(null)
    }
    const del = async (id) => {
        if (!window.confirm('Delete this candidate?')) return
        try { 
            await axios.delete(`${API_URL}/api/candidates/${id}`); 
            setCandidates(p => p.filter(c => c.id !== id)); 
            showToast('Deleted') 
        } catch { showToast('Delete failed', 'error') }
    }

    const getTableWidth = () => {
        let total = 60 // Width for S.No column
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

    return (
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0, width: '100%' }}>

            {/* Drop Zone */}
            <div className="card">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontWeight: 600, color: 'var(--sky)' }}>
                    <Upload size={18} /> Upload Resumes / Excel Sheets
                </div>
                <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ textAlign: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: '8px', background: isDragActive ? 'rgba(var(--sky-rgb), 0.1)' : 'var(--input-bg)', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <input {...getInputProps()} />
                    <div style={{ marginBottom: '1rem' }}>
                        <UploadCloud size={40} className="icon" style={{ color: 'var(--sky)', filter: 'drop-shadow(0 0 10px rgba(var(--sky-rgb), 0.5))' }} />
                    </div>
                    <div className="dropzone-text" style={{ color: 'var(--text-dim)' }}>
                        {isDragActive ? <strong>Drop here…</strong> : <><strong>Drag & drop</strong> PDF / DOCX resumes or XLSX/XLS/CSV sheets, or click to browse</>}
                    </div>
                </div>
                {progress.length > 0 && (
                    <div style={{ marginTop: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {progress.map((p, i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{p.name}</span>
                                    <span className={`badge ${p.status === 'done' ? 'badge-green' : p.status === 'error' ? 'badge-red' : 'badge-sky'}`}>
                                        {p.status === 'done' ? '✓ Done' : p.status === 'error' ? '✗ Error' : 'Processing…'}
                                    </span>
                                </div>
                                <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.percent}%` }} /></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                <div className="section-header" style={{ borderBottom: '1px solid rgba(var(--sky-rgb), 0.2)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="section-title">👥 Candidate Profiles</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start', marginTop: '10px' }}>
                        <button className="btn btn-secondary" onClick={() => setShowFilter(true)} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                            <Filter size={14} /> Filter
                        </button>
                        
                        {/* Columns Selector Popover */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setShowColVisibility(!showColVisibility)} 
                                style={{ gap: 6, color: 'var(--text)', borderColor: 'var(--border)' }}
                            >
                                <Eye size={14} /> Columns
                            </button>
                            
                            {showColVisibility && (
                                <div 
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        position: 'absolute', top: '100%', left: 0, marginTop: '8px', zIndex: 100,
                                        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.35)', padding: '12px', width: '250px',
                                        display: 'flex', flexDirection: 'column', gap: '10px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--gold)' }}>Visible Columns</span>
                                        <button 
                                            onClick={() => setShowColVisibility(false)} 
                                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                                            title="Close Column Settings"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                        <button 
                                            onClick={handleShowAllColumns}
                                            style={{ 
                                                flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer' 
                                            }}
                                        >
                                            Show All
                                        </button>
                                        <button 
                                            onClick={handleHideAllColumns}
                                            style={{ 
                                                flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                                border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer' 
                                            }}
                                        >
                                            Hide All
                                        </button>
                                    </div>
                                    
                                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {cols.filter(c => c.key !== '_actions').map(c => {
                                            const isChecked = !hiddenColumnKeys.includes(c.key);
                                            return (
                                                <label 
                                                    key={c.key} 
                                                    style={{ 
                                                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', 
                                                        color: isChecked ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer',
                                                        padding: '4px 6px', borderRadius: '4px', transition: 'all 0.15s',
                                                        background: isChecked ? 'transparent' : 'rgba(var(--sky-rgb), 0.02)'
                                                    }}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isChecked}
                                                        onChange={() => toggleColumnVisibility(c.key)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="btn btn-secondary" onClick={() => {
                            const initialForm = {};
                            cols.forEach(c => {
                                if (c.key !== '_actions') {
                                    initialForm[c.key] = '';
                                }
                            });
                            setNewCandidateForm(initialForm);
                            setShowAddCandidate(true);
                        }} style={{ gap: 6, color: 'var(--sky)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                            <span style={{ fontWeight: 900 }}>+</span> Add Candidate
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowAddCol(true)} style={{ gap: 6, color: 'var(--gold)', borderColor: 'rgba(var(--gold-rgb), 0.3)' }}>
                            <span style={{ fontWeight: 900 }}>+</span> Add Column
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ gap: 6 }}
                            onClick={() => exportToExcel(formatCandidatesForExcel(filteredCandidates, activeCols.filter(c => c.key !== '_actions')), 'all_candidates_details.xlsx')}
                        >
                            <Download size={14} /> Download Excel
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            onClick={() => { load(); loadCols(); }} 
                            style={{ gap: 6 }}
                            disabled={loadingCandidates}
                        >
                            <RefreshCw size={14} className={loadingCandidates ? 'spin' : ''} /> {loadingCandidates ? 'Refreshing...' : 'Refresh'}
                        </button>
                        {user?.role === 'admin' && (
                            <button className="btn btn-secondary" onClick={() => setShowIntegrations(true)} style={{ gap: 6, color: 'var(--gold)', borderColor: 'rgba(var(--gold-rgb), 0.3)' }}>
                                <Link size={14} /> Connect
                            </button>
                        )}
                    </div>
                </div>

                {candidates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
                        <p>No candidates yet. Upload resumes to get started.</p>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
                            <table style={{ width: getTableWidth(), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                <colgroup>
                                    <col style={{ width: '60px' }} />
                                    {activeCols.map(c => <col key={c.key} style={{ width: c.pct }} />)}
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th style={{
                                            ...TH,
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 12,
                                            width: '60px',
                                            textAlign: 'center'
                                        }}>
                                            S.No
                                        </th>
                                        {activeCols.map(c => {
                                            const isActions = c.key === '_actions';
                                            const isDragged = draggedColKey === c.key;
                                            const isDragTarget = dragOverColKey === c.key;
                                            
                                            // Harmonic highlight background and dashed border for drag targets
                                            let backgroundStyle = isActions ? 'var(--table-header-bg)' : TH.background;
                                            if (isDragTarget && !isDragged) {
                                                backgroundStyle = 'rgba(var(--gold-rgb), 0.18)';
                                            }
                                            
                                            return (
                                                <th 
                                                    key={c.key} 
                                                    draggable={!isActions}
                                                    onDragStart={(e) => !isActions && handleDragStart(e, c.key)}
                                                    onDragOver={(e) => !isActions && handleDragOver(e, c.key)}
                                                    onDragEnter={(e) => !isActions && handleDragEnter(e, c.key)}
                                                    onDragLeave={() => !isActions && setDragOverColKey(null)}
                                                    onDragEnd={() => !isActions && handleDragEnd()}
                                                    onDrop={(e) => !isActions && handleDrop(e, c.key)}
                                                    style={{ 
                                                        ...TH, 
                                                        position: 'sticky', 
                                                        top: 0, 
                                                        right: isActions ? 0 : undefined, 
                                                        zIndex: isActions ? 15 : 12,
                                                        background: backgroundStyle,
                                                        boxShadow: isActions ? '-3px 0 6px rgba(0,0,0,0.15)' : undefined,
                                                        cursor: isActions ? 'default' : (isDragged ? 'grabbing' : 'grab'),
                                                        opacity: isDragged ? 0.4 : 1,
                                                        borderLeft: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                        borderRight: (isDragTarget && !isDragged) ? '2px dashed var(--gold)' : '2px dashed transparent',
                                                        transition: 'all 0.2s ease-in-out'
                                                    }} 
                                                    title={isActions ? c.label : `${c.label} (Drag to reorder)`}
                                                  >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                                                        {!isActions && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                                                {c.isCustom ? (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            handleDeleteCol(c.key, c.label);
                                                                        }}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: '#ef4444',
                                                                            cursor: 'pointer',
                                                                            padding: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            transition: 'transform 0.15s, color 0.15s',
                                                                            opacity: 0.7,
                                                                        }}
                                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.7; }}
                                                                        title="Delete Column"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (window.confirm(`Are you sure you want to delete the "${c.label}" column?`)) {
                                                                                toggleColumnVisibility(c.key);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: 'var(--text-dim)',
                                                                            cursor: 'pointer',
                                                                            padding: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            transition: 'transform 0.15s, color 0.15s',
                                                                            opacity: 0.5,
                                                                        }}
                                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--gold)'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-dim)'; }}
                                                                        title="Hide Column"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                    <tr style={{ background: 'rgba(var(--navy-dark-rgb), 0.5)' }}>
                                        <th
                                            key="filter-s_no"
                                            style={{
                                                padding: '6px 10px',
                                                borderBottom: '2px solid var(--border)',
                                                background: 'rgba(var(--navy-rgb), 0.97)',
                                                position: 'sticky',
                                                top: '38px',
                                                zIndex: 11,
                                                textAlign: 'center',
                                                color: 'var(--gold)',
                                                fontSize: '0.75rem',
                                                fontWeight: 800
                                            }}
                                        >
                                            #
                                        </th>
                                        {activeCols.map(c => {
                                            const isActions = c.key === '_actions';
                                            if (isActions) {
                                                const hasAnyFilter = Object.values(columnFilters).some(v => v);
                                                return (
                                                    <th
                                                        key="filter-_actions"
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderBottom: '2px solid var(--border)',
                                                            position: 'sticky',
                                                            top: '38px',
                                                            right: 0,
                                                            zIndex: 14,
                                                            background: 'rgba(var(--navy-dark-rgb), 0.95)',
                                                            boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        {hasAnyFilter && (
                                                            <button
                                                                onClick={() => setColumnFilters({})}
                                                                style={{
                                                                    background: 'rgba(239, 35, 60, 0.15)',
                                                                    border: '1px solid #ef233c',
                                                                    borderRadius: '4px',
                                                                    color: '#ef233c',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 'bold',
                                                                    padding: '4px 8px',
                                                                    width: '100%',
                                                                    transition: 'all 0.2s',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title="Clear all column filters"
                                                            >
                                                                <X size={10} /> Clear
                                                            </button>
                                                        )}
                                                    </th>
                                                );
                                            }

                                            return (
                                                <th
                                                    key={`filter-${c.key}`}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderBottom: '2px solid var(--border)',
                                                        background: 'rgba(var(--navy-rgb), 0.97)',
                                                        position: 'sticky',
                                                        top: '38px',
                                                        zIndex: 11,
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={columnFilters[c.key] || ''}
                                                        onChange={e => setColumnFilters(prev => ({
                                                            ...prev,
                                                            [c.key]: e.target.value
                                                        }))}
                                                        placeholder="Search..."
                                                        style={{
                                                            width: '100%',
                                                            padding: '5px 8px',
                                                            borderRadius: '5px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--input-bg)',
                                                            color: 'var(--text)',
                                                            fontSize: '0.75rem',
                                                            outline: 'none',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onFocus={e => {
                                                            e.target.style.border = '1px solid var(--gold)';
                                                            e.target.style.boxShadow = '0 0 4px rgba(var(--gold-rgb), 0.3)';
                                                        }}
                                                        onBlur={e => {
                                                            e.target.style.border = '1px solid rgba(var(--sky-rgb), 0.25)';
                                                            e.target.style.boxShadow = 'none';
                                                        }}
                                                    />
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCandidates.length === 0 ? (
                                        <tr>
                                            <td colSpan={activeCols.length + 1} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                                                <p style={{ margin: 0 }}>No candidates match the applied filters.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredCandidates.map((row, ri) => (
                                        <tr key={row.id || ri}
                                            style={{ background: ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent', transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.07)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? 'rgba(var(--navy-rgb), 0.25)' : 'transparent'}
                                        >
                                            <td style={{
                                                ...TD_BASE,
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                color: 'var(--gold)',
                                                borderRight: '1px solid rgba(var(--sky-rgb), 0.07)'
                                            }}>
                                                {ri + 1}
                                            </td>
                                            {activeCols.map(({ key }) => {
                                                /* ── Actions column ── */
                                                if (key === '_actions') return (
                                                    <td 
                                                        key={key} 
                                                        style={{ 
                                                            ...TD_BASE, 
                                                            textAlign: 'center',
                                                            position: 'sticky',
                                                            right: 0,
                                                            zIndex: 10,
                                                            background: ri % 2 === 0 ? 'var(--input-bg)' : 'var(--card-bg)',
                                                            boxShadow: '-3px 0 6px rgba(0,0,0,0.15)',
                                                            overflow: 'visible'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                            <button 
                                                                className="btn btn-danger" 
                                                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }} 
                                                                onClick={() => del(row.id)} 
                                                                title="Delete Candidate"
                                                            >
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                )

                                                const isEditing = editCell?.row === ri && editCell?.col === key
                                                const val = row[key] ?? ''
                                                const isExp = key === 'total_experience' || key === 'pega_experience' || key === 'cdh_exp'
                                                const isExpandable = key === 'skills' || key === 'certifications'

                                                /* ── Inline edit mode ── */
                                                if (isEditing) {
                                                     if (key === 'candidate_status') {
                                                         const statusOptions = ['New', 'In-Review', 'Available', 'Selected', 'Rejected', 'Engaged', 'Offered', 'Hired'];
                                                         return (
                                                             <td key={key} style={TD_BASE}>
                                                                 <select
                                                                     autoFocus
                                                                     value={editVal || 'New'}
                                                                     onChange={async (e) => {
                                                                         const newVal = e.target.value;
                                                                         setEditVal(newVal);
                                                                         try {
                                                                             await axios.put(`${API_URL}/api/candidates/${row.id}`, { candidate_status: newVal });
                                                                             setCandidates(prev => prev.map((r, i) => i === ri ? { ...r, candidate_status: newVal } : r));
                                                                             showToast('Saved!');
                                                                         } catch (err) {
                                                                             showToast(err.response?.data?.detail || 'Save failed', 'error');
                                                                         }
                                                                         setEditCell(null);
                                                                     }}
                                                                     onBlur={() => setEditCell(null)}
                                                                     onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
                                                                     style={{
                                                                         background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                                                         borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                                                         fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                                                     }}
                                                                 >
                                                                     {statusOptions.map(opt => (
                                                                         <option key={opt} value={opt} style={{ background: 'var(--card-bg)', color: 'var(--text)' }}>
                                                                             {opt}
                                                                         </option>
                                                                     ))}
                                                                 </select>
                                                             </td>
                                                         );
                                                     }
                                                     
                                                     return (
                                                         <td key={key} style={TD_BASE}>
                                                             <input autoFocus value={editVal}
                                                                 onChange={e => setEditVal(e.target.value)}
                                                                 onBlur={() => saveEdit(ri)}
                                                                 onKeyDown={e => { if (e.key === 'Enter') saveEdit(ri); if (e.key === 'Escape') setEditCell(null) }}
                                                                 style={{
                                                                     background: 'var(--input-bg)', border: '1px solid var(--gold)',
                                                                     borderRadius: 6, padding: '4px 8px', color: 'var(--text)', width: '100%',
                                                                     fontFamily: 'var(--fb)', fontSize: '0.82rem', outline: 'none'
                                                                 }}
                                                             />
                                                         </td>
                                                     );
                                                 }

                                                /* ── Expandable (skills / certs) — td stays overflow:hidden ── */
                                                if (isExpandable) return (
                                                    <td key={key} style={{ ...TD_BASE }} onDoubleClick={() => startEdit(ri, key, val)}>
                                                        <ExpandableCell value={val} onEdit={() => startEdit(ri, key, val)} />
                                                    </td>
                                                )

                                                /* ── Regular cells ── */
                                                let display;
                                                if (key === 'candidate_status') {
                                                     const s = String(val || 'New').trim();
                                                     let color = '#38bdf8';
                                                     let bg = 'rgba(56, 189, 248, 0.12)';
                                                     let border = '1px solid rgba(56, 189, 248, 0.25)';
                                                     
                                                     const lowerS = s.toLowerCase();
                                                     if (lowerS === 'in-review') {
                                                         color = '#fbbf24'; bg = 'rgba(251, 191, 36, 0.12)'; border = '1px solid rgba(251, 191, 36, 0.25)';
                                                     } else if (lowerS === 'available') {
                                                         color = '#34d399'; bg = 'rgba(52, 211, 153, 0.12)'; border = '1px solid rgba(52, 211, 153, 0.25)';
                                                     } else if (lowerS === 'selected') {
                                                         color = '#2dd4bf'; bg = 'rgba(45, 212, 191, 0.12)'; border = '1px solid rgba(45, 212, 191, 0.25)';
                                                     } else if (lowerS === 'rejected') {
                                                         color = '#f87171'; bg = 'rgba(248, 113, 113, 0.12)'; border = '1px solid rgba(248, 113, 113, 0.25)';
                                                     } else if (lowerS === 'engaged') {
                                                         color = '#c084fc'; bg = 'rgba(192, 132, 252, 0.12)'; border = '1px solid rgba(192, 132, 252, 0.25)';
                                                     } else if (lowerS === 'offered') {
                                                         color = '#f43f5e'; bg = 'rgba(244, 63, 94, 0.12)'; border = '1px solid rgba(244, 63, 94, 0.25)';
                                                     } else if (lowerS === 'hired') {
                                                         color = '#4ade80'; bg = 'rgba(74, 222, 128, 0.15)'; border = '1px solid rgba(74, 222, 128, 0.35)';
                                                     }
                                                     
                                                     display = (
                                                         <span style={{
                                                             background: bg, color: color, border: border,
                                                             borderRadius: 5, padding: '2px 8px', fontSize: '0.73rem',
                                                             fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
                                                             textTransform: 'capitalize'
                                                         }}>
                                                             {s}
                                                         </span>
                                                     );
                                                 } else if (isExp) {
                                                     display = (val !== '' && val != null ? (val === '[HIDDEN]' ? '[HIDDEN]' : `${val} yrs`) : '—');
                                                 } else if (key === 'notice_period' || key === 'availability_in_days') {
                                                     display = (val === '[HIDDEN]') ? '[HIDDEN]' : ((val === 0 || val === '0') ? 'Immediate' : (val !== null && val !== '' && !isNaN(val) ? `${val} days` : (val || '—')));
                                                 } else {
                                                     display = (val !== '' && val != null ? val : '—');
                                                 }
                                                return (
                                                    <td key={key} onClick={() => {
                                                             if (key === 'candidate_status') startEdit(ri, key, val);
                                                         }}
                                                         onDoubleClick={() => {
                                                             if (key !== 'candidate_status') startEdit(ri, key, val);
                                                         }} style={{
                                                        ...TD_BASE,
                                                        color: key === 'full_name' ? 'var(--gold)' : key === 'email' ? 'var(--sky-dim)' : 'var(--text)',
                                                        fontWeight: key === 'full_name' ? 700 : undefined,
                                                        /* overflow already hidden via TD_BASE — text clips cleanly */
                                                        whiteSpace: key === 'full_name' || key === 'current_organization' || key === 'email'
                                                            ? 'normal' : 'nowrap',
                                                        wordBreak: key === 'email' ? 'break-all' : undefined,
                                                        cursor: key === 'candidate_status' ? 'pointer' : 'text',
                                                    }}>
                                                        {key === 'full_name' ? (
                                                            <span
                                                                onClick={() => setSelectedCandidateForDetails(row)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    color: 'var(--gold)',
                                                                    textDecoration: 'underline',
                                                                    cursor: 'pointer',
                                                                    fontWeight: 700,
                                                                    transition: 'color 0.2s'
                                                                }}
                                                                title="View Candidate Details"
                                                            >
                                                                <FileText size={14} style={{ flexShrink: 0, color: 'var(--gold)' }} />
                                                                {display}
                                                            </span>
                                                        ) : display}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.38)' }}>
                            💡 Click <strong style={{ color: 'var(--gold)' }}>+N</strong> to expand Skills / Certs · Double-click any cell to edit
                        </p>
                    </>
                )}
            </div>

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.msg}</div>
                </div>
            )}

            {showAddCandidate && (
                <div className="modal-overlay" style={{ zIndex: 999 }}>
                    <div className="card" style={{ width: 550, maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Candidate Manually</h3>
                            <button onClick={() => setShowAddCandidate(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 5, display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 15 }}>
                            {cols.filter(c => c.key !== '_actions' && c.key !== 'source').map(c => (
                                <div key={c.key}>
                                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                                        {c.label} {c.key === 'full_name' ? '*' : ''}
                                    </label>
                                    {c.key === 'candidate_status' ? (
                                        <select
                                            value={newCandidateForm[c.key] || 'New'}
                                            onChange={e => setNewCandidateForm(p => ({ ...p, [c.key]: e.target.value }))}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        >
                                            <option value="New">New</option>
                                            <option value="Screening">Screening</option>
                                            <option value="Interview">Interview</option>
                                            <option value="Offered">Offered</option>
                                            <option value="Rejected">Rejected</option>
                                        </select>
                                    ) : (
                                        <input
                                            value={newCandidateForm[c.key] || ''}
                                            onChange={e => setNewCandidateForm(p => ({ ...p, [c.key]: e.target.value }))}
                                            placeholder={`Enter ${c.label}`}
                                            type={c.key.includes('experience') || c.key.includes('exp') ? 'number' : 'text'}
                                            step={c.key.includes('experience') || c.key.includes('exp') ? '0.1' : undefined}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 15 }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddCandidate(false)} style={{ flex: 1 }}>
                                Cancel
                            </button>
                            <button className="btn" onClick={handleAddCandidateSubmit} style={{ flex: 1, background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold' }}>
                                Add Candidate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddCol && (
                <div className="modal-overlay">
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Add Custom Column</h3>
                            <button onClick={() => setShowAddCol(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Column Name / Label</label>
                                <input
                                    autoFocus
                                    value={newColForm.label} onChange={e => setNewColForm(p => ({ ...p, label: e.target.value }))}
                                    placeholder="e.g. Current Location"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Description / AI Instructions</label>
                                <textarea
                                    value={newColForm.desc} onChange={e => setNewColForm(p => ({ ...p, desc: e.target.value }))}
                                    placeholder="e.g. City and State where candidate is located"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', minHeight: 80, resize: 'vertical', outline: 'none' }}
                                />
                            </div>
                            <button className="btn" onClick={handleAddCol} style={{ background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold' }}>
                                Create Column
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Modal */}
            {showFilter && (
                <div className="modal-overlay">
                    <div className="card" style={{ width: 400, maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)' }}>Filter Candidates</h3>
                            <button onClick={() => setShowFilter(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Total Experience (Years)</label>
                                <input
                                    type="number"
                                    value={filters.minTotalExp} onChange={e => setFilters(p => ({ ...p, minTotalExp: e.target.value }))}
                                    placeholder="e.g. 5"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Min. Pega Experience (Years)</label>
                                <input
                                    type="number"
                                    value={filters.minPegaExp} onChange={e => setFilters(p => ({ ...p, minPegaExp: e.target.value }))}
                                    placeholder="e.g. 3"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Pega Certifications</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {PEGA_CERTS.map(cert => (
                                        <button 
                                            key={cert} 
                                            onClick={() => toggleCert(cert)}
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: 6, 
                                                background: filters.certs.includes(cert) ? 'rgba(var(--gold-rgb), 0.15)' : 'var(--input-bg)', 
                                                border: `1px solid ${filters.certs.includes(cert) ? 'var(--gold)' : 'var(--border)'}`, 
                                                color: filters.certs.includes(cert) ? 'var(--gold)' : 'var(--text)', 
                                                padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                                                transition: 'all 0.2s'
                                            }}>
                                            {filters.certs.includes(cert) && <Check size={12} />}
                                            {cert}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 5 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Additional Filters</label>
                                    <button 
                                        onClick={() => setCustomFilters(p => [...p, {col: cols.find(c => c.key !== '_del')?.key || '', val: ''}])} 
                                        style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fb)' }}>
                                        + Add Filter
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '150px', overflowY: 'auto' }}>
                                    {customFilters.map((cf, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <select 
                                                value={cf.col} 
                                                onChange={e => { const newF = [...customFilters]; newF[i].col = e.target.value; setCustomFilters(newF); }} 
                                                style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }}>
                                                {cols.filter(c => c.key !== '_del').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                            </select>
                                            <input 
                                                value={cf.val} 
                                                onChange={e => { const newF = [...customFilters]; newF[i].val = e.target.value; setCustomFilters(newF); }} 
                                                placeholder="e.g. Hyderabad" 
                                                style={{ flex: 1, padding: '6px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none', fontSize: '0.75rem', minWidth: '100px' }} 
                                            />
                                            <button 
                                                onClick={() => setCustomFilters(p => p.filter((_, idx) => idx !== i))} 
                                                style={{ background: 'none', border: 'none', color: '#ef233c', cursor: 'pointer', padding: '0 4px', display: 'flex' }}>
                                                <X size={14}/>
                                            </button>
                                        </div>
                                    ))}
                                    {customFilters.length === 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(var(--sky-dim-rgb), 0.4)', fontStyle: 'italic' }}>
                                            No additional filters applied.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button className="btn btn-secondary" onClick={() => { setFilters({ minTotalExp: '', minPegaExp: '', certs: [] }); setCustomFilters([]); setColumnFilters({}); }} style={{ flex: 1, borderColor: 'var(--border)' }}>
                                    Clear All
                                </button>
                                <button className="btn" onClick={() => setShowFilter(false)} style={{ flex: 1, background: '#ffb703', color: '#011627', fontWeight: '900', border: 'none' }}>
                                    Apply Filter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Column Reordering Modal Removed */}

            {/* Resume Viewer Modal */}
            {viewingPdf && (
                <div className="modal-overlay" onClick={() => setViewingPdf(null)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ 
                        width: '90%', maxWidth: 1000, height: '90vh', 
                        display: 'flex', flexDirection: 'column', padding: 0, 
                        overflow: 'hidden'
                    }}>
                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)', borderBottom: '1px solid var(--border)' 
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.05rem' }}>
                                <span style={{fontSize: '1.2rem', opacity: 0.8}}>📄</span> {viewingPdf.name}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <a 
                                    href={viewingPdf.url} 
                                    download 
                                    style={{
                                        background: 'rgba(var(--sky-rgb), 0.1)', 
                                        border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                        color: 'var(--sky-dim)', 
                                        textDecoration: 'none', 
                                        fontSize: '0.85rem', 
                                        fontFamily: 'var(--fh)', 
                                        fontWeight: 700, 
                                        cursor: 'pointer', 
                                        padding: '6px 14px', 
                                        borderRadius: '8px', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '6px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.2)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.1)';
                                        e.currentTarget.style.color = 'var(--sky-dim)';
                                    }}
                                >
                                    <Download size={14} /> Download File
                                </a>
                                <button onClick={() => setViewingPdf(null)} style={{ 
                                    background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)', 
                                    color: 'var(--gold)', cursor: 'pointer', padding: 6, borderRadius: '8px', 
                                    display: 'flex', transition: 'all 0.2s' 
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <iframe 
                            src={`${viewingPdf.url}#view=FitH`} 
                            style={{ width: '100%', flex: 1, border: 'none', background: '#525659' }} 
                            title="Resume Viewer"
                        />
                    </div>
                </div>
            )}

            {/* Integrations settings modal */}
            {showIntegrations && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="card" style={{ 
                        width: integrationsTab === 'templates' ? 920 : 620, 
                        maxWidth: '95%', 
                        maxHeight: '90vh', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        padding: 0,
                        transition: 'width 0.3s ease'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                🔗 System Integrations
                            </h3>
                            <button onClick={() => setShowIntegrations(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
                        </div>
                        
                        {/* Tabs */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(var(--navy-dark-rgb), 0.2)' }}>
                            <button 
                                onClick={() => setIntegrationsTab('mail')}
                                style={{
                                    flex: 1, padding: '12px', border: 'none', background: integrationsTab === 'mail' ? 'rgba(var(--sky-rgb), 0.1)' : 'transparent',
                                    color: integrationsTab === 'mail' ? 'var(--gold)' : 'var(--text-dim)', fontWeight: 700, cursor: 'pointer', borderBottom: integrationsTab === 'mail' ? '2px solid var(--gold)' : 'none',
                                    fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                📧 Connect with Mail
                            </button>
                            <button 
                                onClick={() => setIntegrationsTab('templates')}
                                style={{
                                    flex: 1, padding: '12px', border: 'none', background: integrationsTab === 'templates' ? 'rgba(var(--sky-rgb), 0.1)' : 'transparent',
                                    color: integrationsTab === 'templates' ? 'var(--gold)' : 'var(--text-dim)', fontWeight: 700, cursor: 'pointer', borderBottom: integrationsTab === 'templates' ? '2px solid var(--gold)' : 'none',
                                    fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                📝 Reply Templates
                            </button>
                            <button 
                                onClick={() => setIntegrationsTab('drive')}
                                style={{
                                    flex: 1, padding: '12px', border: 'none', background: integrationsTab === 'drive' ? 'rgba(var(--sky-rgb), 0.1)' : 'transparent',
                                    color: integrationsTab === 'drive' ? 'var(--gold)' : 'var(--text-dim)', fontWeight: 700, cursor: 'pointer', borderBottom: integrationsTab === 'drive' ? '2px solid var(--gold)' : 'none',
                                    fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                💾 Connect with Drive
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 15 }}>
                            {integrationsTab === 'mail' && (
                                <>
                                    {/* Enable switch */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'rgba(var(--sky-rgb), 0.05)', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>Enable Candidate Email Sync</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Polls Gmail unseen messages for attached resumes matching keywords.</div>
                                        </div>
                                        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 22, cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={integrationsSettings.email_enabled === 1}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, email_enabled: e.target.checked ? 1 : 0 }))}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: integrationsSettings.email_enabled === 1 ? 'var(--gold)' : '#334155',
                                                transition: '0.3s', borderRadius: 24, display: 'block'
                                            }} />
                                            <span style={{
                                                position: 'absolute', content: '""', height: 16, width: 16, left: integrationsSettings.email_enabled === 1 ? 24 : 4, bottom: 3,
                                                backgroundColor: '#000', transition: '0.3s', borderRadius: '50%'
                                            }} />
                                        </label>
                                    </div>

                                    {/* Mail Credentials Form */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: integrationsSettings.email_enabled === 1 ? 1 : 0.5, pointerEvents: integrationsSettings.email_enabled === 1 ? 'auto' : 'none' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <label className="modern-label" style={{ fontSize: '0.75rem' }}>Gmail Address / User</label>
                                                <input 
                                                    value={integrationsSettings.email_user || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, email_user: e.target.value }))}
                                                    placeholder="example@gmail.com"
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                                />
                                            </div>
                                            <div>
                                                <label className="modern-label" style={{ fontSize: '0.75rem' }}>Google App Password</label>
                                                <input 
                                                    type="password"
                                                    value={integrationsSettings.email_pass || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, email_pass: e.target.value }))}
                                                    placeholder={integrationsSettings.email_pass === '****' ? '••••••••••••••••' : '16-character app password'}
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Trigger Keywords config */}
                                        <div>
                                            <label className="modern-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>Gmail Trigger Keywords</label>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 6 }}>
                                                Only emails whose subject or body contain one of these keywords will be scanned.
                                            </div>
                                            
                                            {/* Keyword Tags display */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, padding: 8, background: 'rgba(var(--navy-dark-rgb), 0.2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                                {(integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : []).map(kw => (
                                                    <span key={kw} style={{
                                                        background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                                        borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', color: 'var(--sky-dim)',
                                                        display: 'inline-flex', alignItems: 'center', gap: 5
                                                    }}>
                                                        {kw}
                                                        <button 
                                                            type="button" 
                                                            onClick={() => {
                                                                const kws = integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean);
                                                                const updated = kws.filter(k => k !== kw).join(',');
                                                                setIntegrationsSettings(prev => ({ ...prev, keywords: updated }));
                                                            }} 
                                                            style={{ background: 'none', border: 'none', color: '#ef233c', cursor: 'pointer', padding: 0, display: 'flex' }}
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                                {(integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : []).length === 0 && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No keywords set (system defaults to resume, alamaticz, solution, job)</span>
                                                )}
                                            </div>

                                            <input 
                                                placeholder="Type a word (e.g. cv) and press Enter to add keyword"
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const val = e.target.value.trim().toLowerCase();
                                                        if (val) {
                                                            const kws = integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
                                                            if (!kws.includes(val)) {
                                                                const updated = [...kws, val].join(',');
                                                                setIntegrationsSettings(prev => ({ ...prev, keywords: updated }));
                                                            }
                                                        }
                                                        e.target.value = '';
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                            />
                                        </div>

                                        {/* Server Ports (Collapsible/Advanced) */}
                                        <div style={{ marginTop: 5 }}>
                                            <details style={{ cursor: 'pointer' }}>
                                                <summary style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600 }}>Advanced IMAP/SMTP Connection Details</summary>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10, cursor: 'default' }}>
                                                    <div>
                                                        <label className="modern-label" style={{ fontSize: '0.72rem' }}>IMAP Host</label>
                                                        <input 
                                                            value={integrationsSettings.imap_host || ''}
                                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, imap_host: e.target.value }))}
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="modern-label" style={{ fontSize: '0.72rem' }}>IMAP Port</label>
                                                        <input 
                                                            type="number"
                                                            value={integrationsSettings.imap_port || 993}
                                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))}
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="modern-label" style={{ fontSize: '0.72rem' }}>SMTP Host</label>
                                                        <input 
                                                            value={integrationsSettings.smtp_host || ''}
                                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="modern-label" style={{ fontSize: '0.72rem' }}>SMTP Port</label>
                                                        <input 
                                                            type="number"
                                                            value={integrationsSettings.smtp_port || 587}
                                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                </div>
                                            </details>
                                        </div>

                                        {/* Live connection check status banner */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderRadius: 8,
                                            background: testStatus.status === 'connected' ? 'rgba(74, 222, 128, 0.08)' : 
                                                        testStatus.status === 'error' ? 'rgba(239, 35, 60, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid ' + (
                                                        testStatus.status === 'connected' ? 'rgba(74, 222, 128, 0.3)' : 
                                                        testStatus.status === 'error' ? 'rgba(239, 35, 60, 0.3)' : 'var(--border)'
                                                    )
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {testStatus.status === 'testing' ? (
                                                    <Loader size={14} className="spin" style={{ color: 'var(--sky-dim)' }} />
                                                ) : testStatus.status === 'connected' ? (
                                                    <span style={{ color: '#4ade80', fontSize: '0.9rem' }}>✔</span>
                                                ) : testStatus.status === 'error' ? (
                                                    <span style={{ color: '#ef233c', fontSize: '0.9rem' }}>✘</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>⚪</span>
                                                )}
                                                <span style={{
                                                    fontSize: '0.78rem',
                                                    color: testStatus.status === 'connected' ? '#4ade80' : 
                                                           testStatus.status === 'error' ? '#ef233c' : 'var(--text-dim)',
                                                    fontWeight: 600
                                                }}>
                                                    {testStatus.message || 'Gmail Status: Not Checked'}
                                                </span>
                                            </div>
                                            <button 
                                                type="button" 
                                                className="btn btn-secondary" 
                                                onClick={runConnectionTest} 
                                                disabled={testingConnection || !integrationsSettings.email_enabled}
                                                style={{ padding: '4px 12px', fontSize: '0.73rem', cursor: 'pointer', height: 'fit-content' }}
                                            >
                                                {testingConnection ? 'Testing...' : 'Test Connection'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {integrationsTab === 'templates' && (
                                <div style={{ display: 'flex', gap: 20, height: '100%' }}>
                                    {/* Left Form */}
                                    <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <label className="modern-label" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Select Email Theme Preset</label>
                                            <select 
                                                value={integrationsSettings.reply_theme || 'professional'}
                                                onChange={e => handleThemeChange(e.target.value)}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                            >
                                                <option value="professional">💼 Professional (Default)</option>
                                                <option value="creative">🚀 Creative & Enthusiastic</option>
                                                <option value="warm">❤️ Warm & Friendly</option>
                                                <option value="custom">✏️ Custom Template (Editable)</option>
                                            </select>
                                        </div>

                                        {/* Custom Edit Option */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: integrationsSettings.reply_theme === 'custom' ? 1 : 0.7 }}>
                                            {integrationsSettings.reply_theme !== 'custom' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(var(--sky-rgb), 0.05)', borderRadius: 6, border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                                        Showing read-only preset template. Want to customize?
                                                    </span>
                                                    <button 
                                                        type="button" 
                                                        className="btn" 
                                                        onClick={() => handleThemeChange('custom')}
                                                        style={{ padding: '4px 10px', fontSize: '0.7rem', background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderRadius: 4 }}
                                                    >
                                                        ✏️ Customize
                                                    </button>
                                                </div>
                                            )}

                                            <div>
                                                <label className="modern-label" style={{ fontSize: '0.75rem' }}>Subject Format</label>
                                                <input 
                                                    value={integrationsSettings.reply_subject || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, reply_subject: e.target.value }))}
                                                    disabled={integrationsSettings.reply_theme !== 'custom'}
                                                    placeholder="Re: {subject} (Ref: {ref})"
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label className="modern-label" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Missing Info Message Body</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sent when candidate details are missing</span>
                                                </label>
                                                <textarea 
                                                    value={integrationsSettings.reply_body_missing || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, reply_body_missing: e.target.value }))}
                                                    disabled={integrationsSettings.reply_theme !== 'custom'}
                                                    rows={5}
                                                    placeholder="Enter template body..."
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div>
                                                <label className="modern-label" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Completed Application Message Body</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sent when candidate profile is complete</span>
                                                </label>
                                                <textarea 
                                                    value={integrationsSettings.reply_body_complete || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, reply_body_complete: e.target.value }))}
                                                    disabled={integrationsSettings.reply_theme !== 'custom'}
                                                    rows={5}
                                                    placeholder="Enter template body..."
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                                                />
                                            </div>

                                            {/* Variables Reference */}
                                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: 6 }}>💡 Insertable Variables:</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {['{candidate_name}', '{missing_fields}', '{subject}', '{ref}'].map(variable => (
                                                        <span 
                                                            key={variable} 
                                                            title="Click to copy variable placeholder"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(variable);
                                                                showToast(`Copied ${variable} to clipboard!`, 'info');
                                                            }}
                                                            style={{
                                                                fontSize: '0.7rem', fontFamily: 'monospace', background: 'rgba(var(--sky-rgb), 0.15)',
                                                                color: 'var(--sky-dim)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                                                borderRadius: 4, padding: '2px 6px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            {variable}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Preview */}
                                    <div style={{ flex: 0.9, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>👁️ Real-time Email Preview</span>
                                            
                                            {/* Toggle buttons */}
                                            <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 2, border: '1px solid var(--border)' }}>
                                                <button 
                                                    type="button"
                                                    onClick={() => setPreviewType('missing')}
                                                    style={{
                                                        padding: '4px 10px', fontSize: '0.7rem', border: 'none', borderRadius: 4,
                                                        background: previewType === 'missing' ? 'var(--gold)' : 'transparent',
                                                        color: previewType === 'missing' ? '#000' : 'var(--text-dim)',
                                                        fontWeight: 600, cursor: 'pointer'
                                                    }}
                                                >
                                                    Missing Info
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => setPreviewType('complete')}
                                                    style={{
                                                        padding: '4px 10px', fontSize: '0.7rem', border: 'none', borderRadius: 4,
                                                        background: previewType === 'complete' ? 'var(--gold)' : 'transparent',
                                                        color: previewType === 'complete' ? '#000' : 'var(--text-dim)',
                                                        fontWeight: 600, cursor: 'pointer'
                                                    }}
                                                >
                                                    Complete Info
                                                </button>
                                            </div>
                                        </div>

                                        {/* Email Client Simulator */}
                                        <div style={{
                                            flex: 1, background: '#0e1724', borderRadius: 8, border: '1px solid var(--border)',
                                            display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'inset 0 0 15px rgba(0,0,0,0.5)',
                                            minHeight: 280
                                        }}>
                                            {/* Mock header window control bar */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#162235', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56' }}></div>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e' }}></div>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f' }}></div>
                                                <div style={{ marginLeft: 10, fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>mail-ack-daemon</div>
                                            </div>

                                            {/* Email headers */}
                                            <div style={{ padding: 12, borderBottom: '1px solid rgba(var(--sky-rgb), 0.15)', display: 'flex', flexDirection: 'column', gap: 6, background: '#111b2b', fontSize: '0.78rem' }}>
                                                <div>
                                                    <span style={{ color: 'var(--text-dim)' }}>From: </span>
                                                    <strong style={{ color: 'var(--sky-dim)' }}>Alamaticz Solutions HR Team</strong> &lt;{integrationsSettings.email_user || 'hr@alamaticz.com'}&gt;
                                                </div>
                                                <div>
                                                    <span style={{ color: 'var(--text-dim)' }}>To: </span>
                                                    <strong style={{ color: 'var(--text)' }}>Somasekhar Kundurthi</strong> &lt;candidate@gmail.com&gt;
                                                </div>
                                                <div>
                                                    <span style={{ color: 'var(--text-dim)' }}>Subject: </span>
                                                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                                                        {getPreviewText(integrationsSettings.reply_subject, previewType === 'missing' ? integrationsSettings.reply_body_missing : integrationsSettings.reply_body_complete).subject}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Email body */}
                                            <div style={{
                                                flex: 1, padding: 16, overflowY: 'auto', fontSize: '0.78rem',
                                                color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: '#09101b'
                                            }}>
                                                {getPreviewText(integrationsSettings.reply_subject, previewType === 'missing' ? integrationsSettings.reply_body_missing : integrationsSettings.reply_body_complete).body}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {integrationsTab === 'drive' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {/* Google Drive Status/Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'rgba(var(--sky-rgb), 0.05)', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>Enable Google Drive Sync</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Automatically upload processed candidate resumes to your Google Drive folder.</div>
                                        </div>
                                        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 22, cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={integrationsSettings.drive_enabled === 1}
                                                disabled={!integrationsSettings.gdrive_refresh_token}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, drive_enabled: e.target.checked ? 1 : 0 }))}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: integrationsSettings.drive_enabled === 1 ? 'var(--gold)' : '#334155',
                                                transition: '0.3s', borderRadius: 24, display: 'block',
                                                opacity: !integrationsSettings.gdrive_refresh_token ? 0.5 : 1
                                            }} />
                                            <span style={{
                                                position: 'absolute', content: '""', height: 16, width: 16, left: integrationsSettings.drive_enabled === 1 ? 24 : 4, bottom: 3,
                                                backgroundColor: '#000', transition: '0.3s', borderRadius: '50%'
                                            }} />
                                        </label>
                                    </div>
                                    
                                    {!integrationsSettings.gdrive_refresh_token && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(239, 35, 60, 0.08)', border: '1px solid rgba(239, 35, 60, 0.3)', borderRadius: 8, fontSize: '0.75rem', color: '#ef233c' }}>
                                            ⚠️ Google Drive is not authorized. Please complete the authorization process below before enabling sync.
                                        </div>
                                    )}

                                    {/* Setup instructions with direct URLs */}
                                    <div style={{ 
                                        padding: '12px 14px', 
                                        background: 'rgba(var(--sky-rgb), 0.04)', 
                                        border: '1px solid rgba(var(--sky-rgb), 0.15)', 
                                        borderRadius: 8, 
                                        fontSize: '0.76rem', 
                                        color: 'var(--text-dim)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8
                                    }}>
                                        <div style={{ fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            ℹ️ Google Drive Integration Setup Guide
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: '1.4' }}>
                                            <li>
                                                Enable the <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline' }}>Google Drive API</a> in your Google Cloud Console.
                                            </li>
                                            <li>
                                                Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline' }}>Credentials page</a>, click <strong>Create Credentials</strong> &gt; <strong>OAuth Client ID</strong>, select <strong>Web application</strong>.
                                            </li>
                                            <li>
                                                Add <code>http://localhost</code> to the <strong>Authorized redirect URIs</strong>.
                                            </li>
                                            <li>
                                                Folder ID: Create or open a folder on <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline' }}>Google Drive</a>, and copy the long string from the end of the URL (e.g. the <code>1A2B3C...</code> in <code>drive.google.com/drive/folders/1A2B3C...</code>).
                                            </li>
                                        </ul>
                                    </div>

                                    {/* Credentials Form */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                    <label className="modern-label" style={{ fontSize: '0.75rem', margin: 0 }}>Google Client ID</label>
                                                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Find Key ↗</a>
                                                </div>
                                                <input 
                                                    value={integrationsSettings.gdrive_client_id || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_client_id: e.target.value }))}
                                                    placeholder="Enter your OAuth 2.0 Client ID"
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                    <label className="modern-label" style={{ fontSize: '0.75rem', margin: 0 }}>Google Client Secret</label>
                                                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Find Secret ↗</a>
                                                </div>
                                                <input 
                                                    type="text"
                                                    value={integrationsSettings.gdrive_client_secret || ''}
                                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_client_secret: e.target.value }))}
                                                    placeholder={integrationsSettings.gdrive_client_secret === '****' ? '••••••••••••••••' : 'Enter your OAuth 2.0 Client Secret'}
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <label className="modern-label" style={{ fontSize: '0.75rem', margin: 0 }}>Google Drive Target Folder ID</label>
                                                <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Open Drive ↗</a>
                                            </div>
                                            <input 
                                                value={integrationsSettings.gdrive_folder_id || ''}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_folder_id: e.target.value }))}
                                                placeholder="Enter target Folder ID (leave empty for root directory)"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Authorization Area */}
                                    <div style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border)', borderRadius: 12, padding: 15 }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: 'var(--gold)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04rem' }}>🔐 Google Drive Account Authorization</h4>
                                        
                                        {integrationsSettings.gdrive_email ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.3)', padding: '10px 14px', borderRadius: 8 }}>
                                                <div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Connected Account</div>
                                                    <strong style={{ fontSize: '0.82rem', color: '#4ade80' }}>{integrationsSettings.gdrive_email}</strong>
                                                </div>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-secondary" 
                                                    onClick={handleDisconnectGdrive}
                                                    style={{ color: '#ef233c', borderColor: 'rgba(239, 35, 60, 0.3)', padding: '6px 12px', fontSize: '0.75rem', height: 'fit-content' }}
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: '#000', width: 20, height: 20, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.72rem' }}>1</span>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Generate Authorization Link</span>
                                                    <button 
                                                        type="button" 
                                                        className="btn btn-secondary" 
                                                        onClick={handleGenerateGdriveAuthUrl}
                                                        disabled={!integrationsSettings.gdrive_client_id}
                                                        style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.7rem' }}
                                                    >
                                                        Generate URL
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: '#000', width: 20, height: 20, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.72rem' }}>2</span>
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Paste redirect URL or authorization code</span>
                                                    </div>
                                                    <input 
                                                        value={gdriveAuthCode}
                                                        onChange={e => setGdriveAuthCode(e.target.value)}
                                                        placeholder="http://localhost/?code=4/0Af... or code value"
                                                        style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.75rem' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: '#000', width: 20, height: 20, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.72rem' }}>3</span>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Confirm connection</span>
                                                    <button 
                                                        type="button" 
                                                        className="btn" 
                                                        onClick={handleExchangeGdriveCode}
                                                        disabled={exchangingGdriveCode || !gdriveAuthCode || !integrationsSettings.gdrive_client_id}
                                                        style={{ marginLeft: 'auto', background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold', padding: '4px 12px', fontSize: '0.7rem' }}
                                                    >
                                                        {exchangingGdriveCode ? 'Connecting...' : 'Connect Account'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowIntegrations(false)} style={{ flex: 1 }}>
                                Cancel
                            </button>
                            <button className="btn" onClick={saveIntegrationsSettings} style={{ flex: 1, background: 'var(--gradient-gold)', color: '#000', fontWeight: 'bold' }}>
                                Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedCandidateForDetails && (
                <CandidateDetailsModal
                    candidate={selectedCandidateForDetails}
                    onClose={() => setSelectedCandidateForDetails(null)}
                    onViewPdf={(filename, name) => {
                        setSelectedCandidateForDetails(null);
                        setViewingPdf({ url: `${BACKEND_URL}/static/${filename}`, name });
                    }}
                />
            )}
        </div>
    )
}

/* ─── Candidate Details Modal ────────────────────────────────────────────── */
function CandidateDetailsModal({ candidate, onClose, onViewPdf }) {
    const [activeTab, setActiveTab] = useState('profile');
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);

    useEffect(() => {
        if (candidate?.id) {
            setLoadingJobs(true);
            axios.get(`${API_URL}/api/candidates/${candidate.id}/jobs`)
                .then(res => setJobs(res.data || []))
                .catch(err => console.error("Failed to load candidate matched jobs", err))
                .finally(() => setLoadingJobs(false));
        }
    }, [candidate]);

    const isImmediate = (val) => {
        if (val === 0 || val === '0') return true;
        return String(val || '').toLowerCase().includes('immediate');
    };

    const isPdf = candidate.filename && candidate.filename.toLowerCase().endsWith('.pdf');

    const hasViewableResume = candidate.filename && 
        !candidate.filename.toLowerCase().endsWith('.xlsx') && 
        !candidate.filename.toLowerCase().endsWith('.xls') && 
        !candidate.filename.toLowerCase().endsWith('.csv');

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', zIndex: 99998,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{
                width: '95%', 
                maxWidth: hasViewableResume ? '1400px' : '800px', 
                height: hasViewableResume ? '90vh' : 'auto',
                maxHeight: '90vh',
                display: 'flex', 
                flexDirection: 'row', 
                padding: 0,
                overflow: 'hidden', 
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                background: 'var(--navy-dark)'
            }}>
                {/* Left Panel: Candidate details */}
                <div style={{
                    flex: hasViewableResume ? '1 1 50%' : '1 1 100%',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    overflow: 'hidden',
                    borderRight: hasViewableResume ? '1px solid var(--border)' : 'none'
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '16px 24px', background: 'rgba(var(--navy-rgb), 0.95)',
                        borderBottom: '1px solid var(--border)'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.25rem', fontWeight: 800 }}>
                                {candidate.full_name || 'Candidate Details'}
                            </h3>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', gap: '15px' }}>
                                <span>Source: <strong style={{ color: 'var(--gold)' }}>{candidate.source || 'Resume Upload'}</strong></span>
                                {candidate.timestamp && <span>Analyzed: {new Date(candidate.timestamp).toLocaleDateString()}</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {candidate.filename && !candidate.filename.toLowerCase().endsWith('.xlsx') && !candidate.filename.toLowerCase().endsWith('.xls') && !candidate.filename.toLowerCase().endsWith('.csv') && (
                                isPdf ? (
                                    <button 
                                        onClick={() => onViewPdf(candidate.filename, candidate.full_name)}
                                        style={{
                                            background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                            color: 'var(--sky-dim)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                            fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.25)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.15)'}
                                    >
                                        <FileText size={14} /> Open in New Tab
                                    </button>
                                ) : (
                                    <a 
                                        href={`${import.meta.env.VITE_API_URL || ''}/static/${candidate.filename}`}
                                        download={candidate.filename}
                                        style={{
                                            background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)',
                                            color: 'var(--sky-dim)', cursor: 'pointer', padding: '6px 14px', borderRadius: '8px',
                                            fontSize: '0.8rem', fontFamily: 'var(--fh)', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                                            textDecoration: 'none'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.25)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.15)'}
                                    >
                                        <Download size={14} /> Download Resume
                                    </a>
                                )
                            )}
                            <button onClick={onClose} style={{
                                background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                color: 'var(--gold)', cursor: 'pointer', padding: '6px', borderRadius: '8px',
                                display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--gold-rgb), 0.1)'}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs Selector */}
                    <div style={{ display: 'flex', background: 'rgba(var(--navy-rgb), 0.3)', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
                        <button 
                            onClick={() => setActiveTab('profile')}
                            style={{
                                padding: '12px 20px', background: 'transparent', border: 'none',
                                borderBottom: `3px solid ${activeTab === 'profile' ? 'var(--gold)' : 'transparent'}`,
                                color: activeTab === 'profile' ? 'var(--gold)' : 'var(--text-dim)',
                                fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                                transition: 'all 0.2s', outline: 'none'
                            }}
                        >
                            👤 Profile Details
                        </button>
                        <button 
                            onClick={() => setActiveTab('jobs')}
                            style={{
                                padding: '12px 20px', background: 'transparent', border: 'none',
                                borderBottom: `3px solid ${activeTab === 'jobs' ? 'var(--gold)' : 'transparent'}`,
                                color: activeTab === 'jobs' ? 'var(--gold)' : 'var(--text-dim)',
                                fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                                transition: 'all 0.2s', outline: 'none'
                            }}
                        >
                            💼 Matched & Selected Jobs ({jobs.length})
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', color: 'var(--text)' }}>
                        {activeTab === 'profile' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Grid fields */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Name</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.full_name || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Source</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.1)', padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                            {candidate.source || 'Resume Upload'}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Total Experience</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.total_experience ? `${candidate.total_experience} yrs` : '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Pega Experience</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.pega_experience ? `${candidate.pega_experience} yrs` : '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>CDH Experience</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.cdh_exp ? `${candidate.cdh_exp} yrs` : '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current CTC / salary</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.ctc || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Expected CTC</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.expected_ctc || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Percentage Hike</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.percentage_hike || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Notice Period</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                                            <span className={`badge ${isImmediate(candidate.notice_period) ? 'badge-green' : 'badge-sky'}`}>
                                                {candidate.notice_period === 0 || candidate.notice_period === '0' ? 'Immediate' : (candidate.notice_period ? `${candidate.notice_period} days` : '—')}
                                            </span>
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current Location</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.current_location || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Preferred Location</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.pref_locations || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Current Employment</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.current_organization || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Phone Number</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{candidate.phone || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>Email Address</span>
                                        {candidate.email ? (
                                            <a 
                                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${candidate.email}`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--sky-dim)', textDecoration: 'underline', wordBreak: 'break-all' }}
                                                title="Click to compose in Gmail"
                                            >
                                                ✉️ {candidate.email}
                                            </a>
                                        ) : '—'}
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>LinkedIn Profile</span>
                                        {candidate.linkedin ? (
                                            <a href={candidate.linkedin.startsWith('http') ? candidate.linkedin : `https://${candidate.linkedin}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)', textDecoration: 'underline' }}>
                                                View LinkedIn
                                            </a>
                                        ) : '—'}
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />

                                {/* Long Text Areas */}
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Skills</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {candidate.skills ? String(candidate.skills).split(',').map((s, idx) => (
                                            <span key={idx} style={{
                                                background: 'rgba(var(--sky-rgb), 0.12)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                                                borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--sky-dim)'
                                            }}>{s.trim()}</span>
                                        )) : <span style={{ opacity: 0.35 }}>—</span>}
                                    </div>
                                </div>

                                <div>
                                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Certifications</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {candidate.certifications ? String(candidate.certifications).split(',').map((c, idx) => (
                                            <span key={idx} style={{
                                                background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.25)',
                                                borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--gold)'
                                            }}>{c.trim()}</span>
                                        )) : <span style={{ opacity: 0.35 }}>—</span>}
                                    </div>
                                </div>

                                {candidate.notescomments && (
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>Notes / Recruiter Comments</span>
                                        <div style={{ padding: '12px', background: 'rgba(var(--navy-dark-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                            {candidate.notescomments}
                                        </div>
                                    </div>
                                )}

                                {candidate.email_message && (
                                    <div>
                                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>✉️ Imported Email Message</span>
                                        <div style={{ 
                                            padding: '12px', 
                                            background: 'rgba(var(--navy-dark-rgb), 0.5)', 
                                            border: '1px solid var(--border)', 
                                            borderRadius: '8px', 
                                            fontSize: '0.84rem', 
                                            whiteSpace: 'pre-wrap', 
                                            lineHeight: '1.45',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            color: 'var(--text)',
                                            fontFamily: 'monospace'
                                        }}>
                                            {candidate.email_message}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>
                                {loadingJobs ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                        <Loader className="spin" size={24} style={{ color: 'var(--gold)' }} />
                                    </div>
                                ) : jobs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                        No associated job mappings found for this candidate.
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(var(--navy-rgb), 0.85)', borderBottom: '2px solid var(--border)' }}>
                                                    <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Job Title</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Client</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800 }}>Status</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--gold)', fontFamily: 'var(--fh)', fontWeight: 800, width: '45%' }}>AI Match Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {jobs.map((job, idx) => {
                                                    const s = String(job.match_status || 'matched').trim();
                                                    const isSelected = s === 'selected';
                                                    
                                                    return (
                                                        <tr key={idx} style={{ 
                                                            borderBottom: '1px solid rgba(var(--sky-rgb), 0.08)',
                                                            background: idx % 2 === 0 ? 'rgba(var(--navy-rgb), 0.15)' : 'transparent'
                                                        }}>
                                                            <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{job.title}</td>
                                                            <td style={{ padding: '10px 12px' }}>{job.client_name || '—'}</td>
                                                            <td style={{ padding: '10px 12px' }}>
                                                                <span style={{
                                                                    background: isSelected ? 'rgba(45, 212, 191, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                                                                    color: isSelected ? '#2dd4bf' : '#38bdf8',
                                                                    border: isSelected ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid rgba(56, 189, 248, 0.25)',
                                                                    borderRadius: 5, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
                                                                    textTransform: 'uppercase', display: 'inline-block'
                                                                }}>
                                                                    {s}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: '1.45' }}>
                                                                {job.ai_reason || '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Resume PDF embedded directly or Download Placeholder */}
                {hasViewableResume && (
                    <div style={{
                        flex: '1 1 50%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        background: '#525659'
                    }}>
                        <iframe 
                            src={`${API_URL}/static/${candidate.filename}#view=FitH`} 
                            style={{ width: '100%', height: '100%', border: 'none', background: '#525659' }} 
                            title="Candidate Resume"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

