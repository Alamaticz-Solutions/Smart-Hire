import { useState, useEffect, useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FileText, Eye, Sparkles, Check, Info, Copy, Save, AlertCircle, AlertTriangle, Send, Loader, Mail, Pencil } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'

const THEME_PRESETS = {
  professional: {
    name: "Professional Preset (Default)",
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
    name: "Creative & Enthusiastic Preset",
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
    name: "Warm & Friendly Preset",
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

export default function TemplatesPage() {
    const { user } = useOutletContext()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [saving, setSaving] = useState(false)
    const [editorTab, setEditorTab] = useState('missing') // 'missing' | 'complete'
    const [previewType, setPreviewType] = useState('missing') // 'missing' | 'complete'
    const [testEmail, setTestEmail] = useState('')
    const [isTestingEmail, setIsTestingEmail] = useState(false)
    const bodyTextareaRef = useRef(null)
    
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
        gdrive_email: '',
        additional_emails: '[]',
        theme_usage_counts: '{}',
        default_resume_template: 'alamaticz'
    })

    const fetchIntegrationsSettings = useCallback(async () => {
        try {
            const res = await apiClient.get('/api/integrations', {
                headers: { 'x-user-username': user?.username }
            })
            setIntegrationsSettings(res.data)
            
            // Sync default preview state with initial theme config
            if (res.data.reply_theme) {
                // If it is professional/warm/creative and missing body configs are empty in DB, load preset values
                const currentTheme = res.data.reply_theme;
                if (currentTheme !== 'custom' && THEME_PRESETS[currentTheme]) {
                    const preset = THEME_PRESETS[currentTheme];
                    setIntegrationsSettings(prev => ({
                        ...prev,
                        reply_subject: prev.reply_subject || preset.subject,
                        reply_body_missing: prev.reply_body_missing || preset.body_missing,
                        reply_body_complete: prev.reply_body_complete || preset.body_complete
                    }));
                }
            }
        } catch (err) {
            console.error('Error fetching integrations settings:', err)
            showToast('Failed to load reply templates', 'error')
        }
    }, [user?.username])

    useEffect(() => {
        if (user?.role === 'admin' || user?.is_admin === 1) {
            fetchIntegrationsSettings()
        }
    }, [fetchIntegrationsSettings, user])

    const saveIntegrationsSettings = async () => {
        setSaving(true)
        try {
            await apiClient.post('/api/integrations', integrationsSettings, {
                headers: { 'x-user-username': user?.username }
            })
            showToast("Reply templates saved successfully!", "success")
            fetchIntegrationsSettings()
        } catch (err) {
            showToast(err.response?.data?.detail || "Failed to save template settings", "error")
        } finally {
            setSaving(false)
        }
    }

    const handleTestEmail = async () => {
        if (!testEmail) {
            showToast("Please enter an email address for testing", "error");
            return;
        }
        
        setIsTestingEmail(true);
        try {
            const res = await apiClient.post('/api/settings/test-email-template', {
                recipient_email: testEmail,
                preview_type: previewType,
                subject_template: integrationsSettings.reply_subject,
                body_template: previewType === 'missing' ? integrationsSettings.reply_body_missing : integrationsSettings.reply_body_complete
            }, {
                headers: { 'x-user-username': user?.username }
            });
            
            if (res.data.status === "success") {
                showToast(res.data.message, "success");
            } else {
                showToast(res.data.message || "Failed to send test email", "error");
            }
        } catch (err) {
            showToast(err.response?.data?.detail || err.response?.data?.message || "Failed to send test email", "error");
        } finally {
            setIsTestingEmail(false);
        }
    }

    const handleThemeChange = async (newTheme) => {
        // S9.3: switching to a preset used to silently overwrite whatever
        // subject/body text was already there. Warn first when there's
        // content that would actually be lost.
        if (newTheme !== 'custom' && newTheme !== integrationsSettings.reply_theme) {
            const hasContent = Boolean(integrationsSettings.reply_subject || integrationsSettings.reply_body_missing || integrationsSettings.reply_body_complete);
            if (hasContent) {
                const ok = await confirm({
                    title: 'Switch template preset?',
                    message: "This replaces the current subject and body text with the preset's text. Any edits you haven't saved will be lost.",
                    confirmLabel: 'Switch preset',
                });
                if (!ok) return;
            }
        }
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
        showToast(`Theme preset updated to: ${newTheme === 'custom' ? 'Custom Editable' : newTheme}`, 'info');
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

    const activeBodyValue = editorTab === 'missing' 
        ? integrationsSettings.reply_body_missing 
        : integrationsSettings.reply_body_complete;

    const handleBodyTextChange = (text) => {
        setIntegrationsSettings(prev => ({
            ...prev,
            [editorTab === 'missing' ? 'reply_body_missing' : 'reply_body_complete']: text
        }));
    };

    // S9.2: insert the variable at the cursor when the body editor has
    // focus, instead of only copying it to the clipboard for a manual paste.
    const handleInsertVariable = (variable) => {
        const ta = bodyTextareaRef.current;
        if (ta && document.activeElement === ta && integrationsSettings.reply_theme === 'custom') {
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            const current = activeBodyValue || '';
            handleBodyTextChange(current.slice(0, start) + variable + current.slice(end));
            requestAnimationFrame(() => {
                ta.focus();
                const pos = start + variable.length;
                ta.setSelectionRange(pos, pos);
            });
            showToast(`Inserted ${variable}`, 'info');
        } else {
            navigator.clipboard.writeText(variable);
            showToast(`Copied ${variable} to clipboard!`, 'info');
        }
    };

    // Auto-align preview tab when editor tab changes for intuitive UX
    const handleEditorTabSwitch = (tab) => {
        setEditorTab(tab);
        setPreviewType(tab);
    }

    const getMostlyUsedTheme = () => {
        try {
            const counts = JSON.parse(integrationsSettings.theme_usage_counts || '{}');
            let maxKey = null;
            let maxVal = 0;
            for (const [key, val] of Object.entries(counts)) {
                if (val > maxVal) {
                    maxVal = val;
                    maxKey = key;
                }
            }
            return maxKey;
        } catch (e) {
            return null;
        }
    };
    const mostlyUsedTheme = getMostlyUsedTheme();

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />

            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={22} /> Reply Templates
                    </h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
                        Draft and customize automated email responses sent back to candidates upon receiving application logs.
                    </p>
                </div>
                
                <button 
                    onClick={saveIntegrationsSettings} 
                    className="btn" 
                    style={{ background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                    disabled={saving}
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Templates'}
                </button>
            </div>

            {/* Main content grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
                
                {/* LEFT EDIT PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    

                    {/* Resume Template Preset Card */}
                    <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <label className="modern-label" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '8px', display: 'block' }}>
                            Default Resume Template
                        </label>
                        <select 
                            value={integrationsSettings.default_resume_template || 'alamaticz'}
                            onChange={e => setIntegrationsSettings({...integrationsSettings, default_resume_template: e.target.value})}
                            style={{ 
                                width: '100%', padding: '12px', borderRadius: 8, 
                                border: '1px solid var(--border)', background: 'var(--input-bg)', 
                                color: 'var(--text)', outline: 'none', fontWeight: 600, fontSize: '0.88rem' 
                            }}
                        >
                            <option value="alamaticz">Alamaticz Format (Standard Layout)</option>
                            <option value="modern">Modern Format (Sleek & Colorful)</option>
                            <option value="classic">Classic Format (Traditional Black & White)</option>
                        </select>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            This template will be selected by default when viewing or exporting candidate resumes.
                        </p>
                    </div>

                    {/* Theme Preset Card */}
                    <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <label className="modern-label" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '8px', display: 'block' }}>
                            Select Email Theme Preset
                        </label>
                        <select 
                            value={integrationsSettings.reply_theme || 'professional'}
                            onChange={e => handleThemeChange(e.target.value)}
                            style={{ 
                                width: '100%', padding: '12px', borderRadius: 8, 
                                border: '1px solid var(--border)', background: 'var(--input-bg)', 
                                color: 'var(--text)', outline: 'none', fontWeight: 600, fontSize: '0.88rem' 
                            }}
                        >
                            <option value="professional">
                                Professional Theme (Standard Recruiter Tone){mostlyUsedTheme === 'professional' ? ' (Mostly Chosen)' : ''}
                            </option>
                            <option value="creative">
                                Creative & Enthusiastic Theme (Startup/Tech Tone){mostlyUsedTheme === 'creative' ? ' (Mostly Chosen)' : ''}
                            </option>
                            <option value="warm">
                                Warm & Friendly Theme (Supportive Recruiter Tone){mostlyUsedTheme === 'warm' ? ' (Mostly Chosen)' : ''}
                            </option>
                            <option value="custom">
                                Custom Template (Fully Editable Editor){mostlyUsedTheme === 'custom' ? ' (Mostly Chosen)' : ''}
                            </option>
                        </select>
                        {mostlyUsedTheme && (
                            <div style={{ 
                                marginTop: '10px', 
                                padding: '6px 12px', 
                                background: 'rgba(212, 175, 55, 0.1)', 
                                border: '1px dashed rgba(212, 175, 55, 0.4)', 
                                borderRadius: '6px', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                fontSize: '0.78rem',
                                color: 'var(--gold)',
                                fontWeight: 500
                            }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> <strong>Mostly Chosen Template:</strong> {mostlyUsedTheme === 'professional' ? 'Professional Theme' : mostlyUsedTheme === 'creative' ? 'Creative Theme' : mostlyUsedTheme === 'warm' ? 'Warm Theme' : 'Custom Template'}</span>
                            </div>
                        )}
                    </div>

                    {/* Editor Panel Card */}
                    <div className="card" style={{ 
                        padding: '24px', background: 'var(--card-bg)', 
                        border: '1px solid var(--border)', borderRadius: '12px',
                        position: 'relative'
                    }}>
                        
                        {/* Title & Theme Banner */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--fh)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {integrationsSettings.reply_theme === 'custom' ? <><Pencil size={14} /> Editing Custom Template</> : <><Eye size={14} /> Viewing Preset Mode</>}
                            </h3>
                            <span style={{ 
                                fontSize: '0.72rem', background: 'rgba(var(--sky-rgb), 0.15)', 
                                border: '1px solid rgba(var(--sky-rgb), 0.3)', color: 'var(--sky-dim)', 
                                padding: '4px 10px', borderRadius: 20, fontWeight: 700
                            }}>
                                {integrationsSettings.reply_theme.toUpperCase()}
                            </span>
                        </div>

                        {integrationsSettings.reply_theme !== 'custom' && (
                            <div style={{ 
                                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', 
                                background: 'rgba(var(--sky-rgb), 0.05)', borderRadius: 8, 
                                border: '1px solid rgba(var(--sky-rgb), 0.15)', marginBottom: '16px'
                            }}>
                                <Info size={16} color="var(--sky-dim)" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                                    Presets are read-only. Want to customize? Switch to editor mode.
                                </span>
                                <button 
                                    type="button" 
                                    className="btn" 
                                    onClick={() => handleThemeChange('custom')}
                                    style={{ 
                                        padding: '6px 12px', fontSize: '0.72rem', background: 'var(--gold)',
                                        color: 'var(--action-fg)', fontWeight: 'bold', cursor: 'pointer', border: 'none',
                                        borderRadius: 6, marginLeft: 'auto', flexShrink: 0
                                    }}
                                >
                                    Customize
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: integrationsSettings.reply_theme === 'custom' ? 1 : 0.8 }}>
                            {/* Subject Field */}
                            <div>
                                <label className="modern-label" style={{ fontSize: '0.78rem', marginBottom: '6px' }}>Subject Format</label>
                                <input 
                                    value={integrationsSettings.reply_subject || ''}
                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, reply_subject: e.target.value }))}
                                    disabled={integrationsSettings.reply_theme !== 'custom'}
                                    placeholder="Re: {subject} (Ref: {ref})"
                                    style={{ 
                                        width: '100%', padding: '10px 14px', borderRadius: 8, 
                                        border: '1px solid var(--border)', background: 'var(--input-bg)', 
                                        color: 'var(--text)', outline: 'none', fontSize: '0.88rem' 
                                    }}
                                />
                            </div>

                            {/* Sub-Editor Tab selection */}
                            <div>
                                <label className="modern-label" style={{ fontSize: '0.78rem', marginBottom: '6px' }}>Configure Email Bodies</label>
                                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.1)' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleEditorTabSwitch('missing')}
                                        style={{
                                            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                                            background: editorTab === 'missing' ? 'rgba(var(--sky-rgb), 0.15)' : 'transparent',
                                            color: editorTab === 'missing' ? 'var(--gold)' : 'var(--text-dim)',
                                            fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.2s',
                                            borderBottom: editorTab === 'missing' ? '2px solid var(--gold)' : 'none'
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={14} /> Missing Details Template</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleEditorTabSwitch('complete')}
                                        style={{
                                            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                                            background: editorTab === 'complete' ? 'rgba(var(--sky-rgb), 0.15)' : 'transparent',
                                            color: editorTab === 'complete' ? 'var(--gold)' : 'var(--text-dim)',
                                            fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.2s',
                                            borderBottom: editorTab === 'complete' ? '2px solid var(--gold)' : 'none'
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> Application Complete Template</span>
                                    </button>
                                </div>
                            </div>

                            {/* Main Body Text Editor */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label className="modern-label" style={{ fontSize: '0.78rem', margin: 0 }}>
                                        {editorTab === 'missing' ? 'Missing Info Message Body' : 'Completed Application Message Body'}
                                    </label>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                        {editorTab === 'missing' ? 'Sent when profile fields are missing.' : 'Sent when application is complete.'}
                                    </span>
                                </div>
                                <textarea
                                    ref={bodyTextareaRef}
                                    value={activeBodyValue || ''}
                                    onChange={e => handleBodyTextChange(e.target.value)}
                                    disabled={integrationsSettings.reply_theme !== 'custom'}
                                    rows={10}
                                    placeholder="Enter template body. Use variables like {candidate_name} to customize."
                                    style={{ 
                                        width: '100%', padding: '14px', borderRadius: 8, 
                                        border: '1px solid var(--border)', background: 'var(--input-bg)', 
                                        color: 'var(--text)', outline: 'none', fontFamily: 'monospace', 
                                        fontSize: '0.85rem', resize: 'vertical', lineHeight: '1.5' 
                                    }}
                                />
                            </div>

                            {/* Variables Reference Micro-chips */}
                            <div style={{ background: 'rgba(var(--navy-dark-rgb), 0.2)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Sparkles size={14} /> Insertable Variable Tags:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {[
                                        { key: '{candidate_name}', desc: 'Full Name' },
                                        { key: '{missing_fields}', desc: 'Bullet list of missing data (Exp, CTC, etc.)' },
                                        { key: '{subject}', desc: 'Original Email Subject' },
                                        { key: '{ref}', desc: 'Candidate ID Reference' }
                                    ].map(variable => (
                                        <span
                                            key={variable.key}
                                            title={`${variable.desc} — click to insert into the focused body editor, or copy`}
                                            onClick={() => handleInsertVariable(variable.key)}
                                            style={{
                                                fontSize: '0.72rem', fontFamily: 'monospace', background: 'rgba(var(--sky-rgb), 0.12)',
                                                color: 'var(--sky-dim)', border: '1px solid rgba(var(--sky-rgb), 0.25)',
                                                borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'inline-flex',
                                                alignItems: 'center', gap: 4, transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.2)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--sky-rgb), 0.12)'}
                                        >
                                            <Copy size={10} />
                                            {variable.key}
                                        </span>
                                    ))}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Info size={11} /> Click any chip above to copy. Paste it directly into your template subject or message body.
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* RIGHT SIMULATOR PREVIEW */}
                <div style={{ position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Eye size={16} /> Real-time Email Preview
                        </span>
                        
                        {/* Preview selector switch */}
                        <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                            <button 
                                type="button"
                                onClick={() => setPreviewType('missing')}
                                style={{
                                    padding: '6px 12px', fontSize: '0.72rem', border: 'none', borderRadius: 6,
                                    background: previewType === 'missing' ? 'var(--gold)' : 'transparent',
                                    color: previewType === 'missing' ? 'var(--action-fg)' : 'var(--text-dim)',
                                    fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                Missing Info
                            </button>
                            <button 
                                type="button"
                                onClick={() => setPreviewType('complete')}
                                style={{
                                    padding: '6px 12px', fontSize: '0.72rem', border: 'none', borderRadius: 6,
                                    background: previewType === 'complete' ? 'var(--gold)' : 'transparent',
                                    color: previewType === 'complete' ? 'var(--action-fg)' : 'var(--text-dim)',
                                    fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                Complete Info
                            </button>
                        </div>
                    </div>

                    {/* Email Client Simulator mockup container — a real inbox renders on a
                        white surface regardless of the app's own theme, so this mock stays
                        light-on-white in both themes rather than following --surface/--text
                        (S9.1: was fixed near-black, which misrepresented what recipients
                        actually see and looked broken sitting inside the light theme). */}
                    <div style={{
                        background: '#FFFFFF', borderRadius: 12, border: '1px solid var(--border)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
                        minHeight: 450
                    }}>
                        {/* Mock header window control bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F1F2F6', padding: '12px 16px', borderBottom: '1px solid #E2E4EC' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }}></div>
                            <div style={{ marginLeft: 12, fontSize: '0.75rem', color: '#6B6F94', fontFamily: 'monospace', letterSpacing: '0.02rem', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={11} /> mail-client-simulator.html</div>
                        </div>

                        {/* Email headers */}
                        <div style={{ padding: 16, borderBottom: '1px solid #E2E4EC', display: 'flex', flexDirection: 'column', gap: 8, background: '#FAFAFC', fontSize: '0.82rem' }}>
                            <div>
                                <span style={{ color: '#6B6F94', fontWeight: 500 }}>From: </span>
                                <strong style={{ color: '#1568A6' }}>Alamaticz Solutions HR Team</strong> &lt;{integrationsSettings.email_user || 'hr@alamaticz.com'}&gt;
                            </div>
                            <div>
                                <span style={{ color: '#6B6F94', fontWeight: 500 }}>To: </span>
                                <strong style={{ color: '#12173F' }}>Somasekhar Kundurthi</strong> &lt;candidate@gmail.com&gt;
                            </div>
                            <div>
                                <span style={{ color: '#6B6F94', fontWeight: 500 }}>Subject: </span>
                                <span style={{ color: '#B0650B', fontWeight: 700 }}>
                                    {getPreviewText(integrationsSettings.reply_subject, previewType === 'missing' ? integrationsSettings.reply_body_missing : integrationsSettings.reply_body_complete).subject}
                                </span>
                            </div>
                        </div>

                        {/* Email body render simulation */}
                        <div style={{
                            flex: 1, padding: 24, overflowY: 'auto', fontSize: '0.85rem',
                            color: '#12173F', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#FFFFFF',
                            fontFamily: 'system-ui, -apple-system, sans-serif'
                        }}>
                            {getPreviewText(integrationsSettings.reply_subject, previewType === 'missing' ? integrationsSettings.reply_body_missing : integrationsSettings.reply_body_complete).body || (
                                <div style={{ color: '#8A8FAF', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
                                    No template content. Start editing to see preview.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Test Email Section */}
                    <div style={{
                        marginTop: 4, background: 'rgba(var(--sky-rgb), 0.05)', borderRadius: 12, padding: 16, border: '1px solid rgba(var(--sky-rgb), 0.15)',
                        display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Send Test Template</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                            Test how this template will look in a real inbox. Make sure to save your changes first!
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input 
                                type="email" 
                                placeholder="Enter email address..."
                                value={testEmail}
                                onChange={e => setTestEmail(e.target.value)}
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                            />
                            <button 
                                type="button" 
                                className="btn"
                                onClick={handleTestEmail}
                                disabled={isTestingEmail}
                                style={{ background: 'var(--sky)', color: 'var(--action-fg)', border: 'none', padding: '8px 16px', fontSize: '0.8rem', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: isTestingEmail ? 'not-allowed' : 'pointer', opacity: isTestingEmail ? 0.7 : 1 }}
                            >
                                {isTestingEmail ? <Loader size={14} className="spin" /> : <Send size={14} />}
                                {isTestingEmail ? 'Sending...' : 'Send Test'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
            <ConfirmDialog {...confirmDialogProps} />
        </div>
    )
}
