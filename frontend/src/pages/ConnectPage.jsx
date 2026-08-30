import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Mail, Shield, Check, X, Plus, Trash2, Key, Folder, RefreshCw, Loader, ExternalLink, AlertCircle, Lock, Users, Eye, EyeOff } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { formatApiError } from '../utils/apiError'

export default function ConnectPage() {
    const { user } = useOutletContext()
    const [activeTab, setActiveTab] = useState('mail') // 'mail' | 'drive'
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [saving, setSaving] = useState(false)
    const [testingConnection, setTestingConnection] = useState(false)
    const [testStatus, setTestStatus] = useState({ status: 'idle', message: '' })
    const [gdriveAuthCode, setGdriveAuthCode] = useState('')
    const [exchangingGdriveCode, setExchangingGdriveCode] = useState(false)
    const [loadingSettings, setLoadingSettings] = useState(false)
    // S8.3: show/hide toggle for pasted credentials, keyed by field name.
    const [showSecrets, setShowSecrets] = useState({})
    const toggleSecretVisible = (field) => setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }))
    
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
        ms_client_id: '',
        ms_client_secret: '',
        ms_tenant_id: 'common',
        gmail_enabled: 0,
        gmail_email: '',
        gmail_pass: '',
        outlook_enabled: 0,
        outlook_email: '',
        additional_emails: '[]'
    })

    const [newEmailForm, setNewEmailForm] = useState({ 
        email_user: '', 
        email_pass: '', 
        imap_host: 'imap.gmail.com', 
        imap_port: 993, 
        smtp_host: 'smtp.gmail.com', 
        smtp_port: 587, 
        email_enabled: 1 
    })
    const [testingMailbox, setTestingMailbox] = useState(null)
    const [mailboxTestStatuses, setMailboxTestStatuses] = useState({})

    const fetchIntegrationsSettings = useCallback(async () => {
        setLoadingSettings(true)
        try {
            const res = await apiClient.get('/api/integrations', {
                headers: { 'x-user-username': user?.username }
            })
            setIntegrationsSettings(res.data)
        } catch (err) {
            console.error('Error fetching integrations settings:', err)
            showToast('Failed to load integration settings', 'error')
        } finally {
            setLoadingSettings(false)
        }
    }, [user?.username])

    useEffect(() => {
        if (user?.role === 'admin' || user?.is_admin === 1) {
            fetchIntegrationsSettings()
        }
    }, [fetchIntegrationsSettings, user])

    const saveIntegrationsSettings = async (showNotification = true) => {
        setSaving(true)
        try {
            await apiClient.post('/api/integrations', integrationsSettings, {
                headers: { 'x-user-username': user?.username }
            })
            if (showNotification) {
                showToast("Integration settings saved successfully!", "success")
            }
        } catch (err) {
            console.error("Save error:", err);
            showToast(formatApiError(err, 'Failed to save integration settings'), 'error');
        } finally {
            setSaving(false)
        }
    }

    const runConnectionTest = async () => {
        setTestingConnection(true)
        setTestStatus({ status: 'testing', message: 'Testing IMAP connection...' })
        try {
            const res = await apiClient.get('/api/integrations/status', {
                headers: { 'x-user-username': user?.username }
            })
            setTestStatus({ status: res.data.status, message: res.data.message })
        } catch (err) {
            setTestStatus({ status: 'error', message: formatApiError(err, 'Failed to run connection test.') })
        } finally {
            setTestingConnection(false)
        }
    }

    const testMailboxConnection = async (mailbox, indexKey) => {
        setTestingMailbox(indexKey)
        setMailboxTestStatuses(prev => ({ ...prev, [indexKey]: { status: 'testing', message: 'Testing connection...' } }))
        try {
            const res = await apiClient.post('/api/integrations/test', {
                email_user: mailbox.email_user,
                email_pass: mailbox.email_pass,
                imap_host: mailbox.imap_host,
                imap_port: mailbox.imap_port
            }, {
                headers: { 'x-user-username': user?.username }
            })
            setMailboxTestStatuses(prev => ({ 
                ...prev, 
                [indexKey]: { status: res.data.status, message: res.data.message } 
            }))
        } catch (err) {
            setMailboxTestStatuses(prev => ({
                ...prev,
                [indexKey]: { status: 'error', message: formatApiError(err, 'Connection failed.') }
            }))
        } finally {
            setTestingMailbox(null)
        }
    }

    const handleAddMailbox = () => {
        // Outlook/office365 mailboxes authenticate via the global Microsoft
        // Graph API settings configured on the Primary Mailbox - the app
        // password field is intentionally hidden for them (see the form
        // below), so requiring it here made it impossible to ever add one.
        const isOutlookHost = newEmailForm.imap_host?.includes('office365')
        if (!newEmailForm.email_user || (!isOutlookHost && !newEmailForm.email_pass)) {
            showToast(isOutlookHost ? "Please enter an email address." : "Please enter both email address and app password.", "error")
            return
        }
        let list = []
        try {
            list = JSON.parse(integrationsSettings.additional_emails || '[]')
        } catch(e) {
            list = []
        }
        if (list.some(m => m.email_user.toLowerCase() === newEmailForm.email_user.toLowerCase())) {
            showToast("This email account is already added.", "error")
            return
        }
        const updatedList = [...list, { ...newEmailForm }]
        setIntegrationsSettings(prev => ({ ...prev, additional_emails: JSON.stringify(updatedList) }))
        setNewEmailForm({
            email_user: '',
            email_pass: '',
            imap_host: 'imap.gmail.com',
            imap_port: 993,
            smtp_host: 'smtp.gmail.com',
            smtp_port: 587,
            email_enabled: 1
        })
        setMailboxTestStatuses(prev => {
            const copy = { ...prev }
            delete copy['new']
            return copy
        })
    }

    const handleDeleteMailbox = (index) => {
        let list = []
        try {
            list = JSON.parse(integrationsSettings.additional_emails || '[]')
        } catch(e) {
            list = []
        }
        list.splice(index, 1)
        setIntegrationsSettings(prev => ({ ...prev, additional_emails: JSON.stringify(list) }))
    }

    const handleToggleMailbox = (index) => {
        let list = []
        try {
            list = JSON.parse(integrationsSettings.additional_emails || '[]')
        } catch(e) {
            list = []
        }
        list[index].email_enabled = list[index].email_enabled === 1 ? 0 : 1
        setIntegrationsSettings(prev => ({ ...prev, additional_emails: JSON.stringify(list) }))
    }

    const handlePrimaryEmailChange = (val) => {
        setIntegrationsSettings(prev => {
            const updated = { ...prev, email_user: val }
            const domain = val.split('@')[1]?.toLowerCase() || ""
            
            if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
                updated.imap_host = 'imap.gmail.com'
                updated.imap_port = 993
                updated.smtp_host = 'smtp.gmail.com'
                updated.smtp_port = 587
            } else if (
                domain.includes('outlook.com') || 
                domain.includes('hotmail.com') || 
                domain.includes('office365.com') || 
                domain.includes('alamaticz.com') ||
                domain.includes('live.com')
            ) {
                updated.imap_host = 'outlook.office365.com'
                updated.imap_port = 993
                updated.smtp_host = 'smtp.office365.com'
                updated.smtp_port = 587
            }
            return updated
        })
    }

    const handleAdditionalEmailChange = (val) => {
        setNewEmailForm(prev => {
            const updated = { ...prev, email_user: val }
            const domain = val.split('@')[1]?.toLowerCase() || ""
            
            if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
                updated.imap_host = 'imap.gmail.com'
                updated.imap_port = 993
                updated.smtp_host = 'smtp.gmail.com'
                updated.smtp_port = 587
            } else if (
                domain.includes('outlook.com') || 
                domain.includes('hotmail.com') || 
                domain.includes('office365.com') || 
                domain.includes('alamaticz.com') ||
                domain.includes('live.com')
            ) {
                updated.imap_host = 'outlook.office365.com'
                updated.imap_port = 993
                updated.smtp_host = 'smtp.office365.com'
                updated.smtp_port = 587
            }
            return updated
        })
    }

    const handleGenerateGdriveAuthUrl = () => {
        const clientId = integrationsSettings.gdrive_client_id?.trim();
        if (!clientId) {
            showToast('Please enter a Google Client ID first.', 'error');
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
            showToast('Please enter Client ID and Client Secret first.', 'error');
            return;
        }
        if (!gdriveAuthCode.trim()) {
            showToast('Please paste the authorization code or redirect URL first.', 'error');
            return;
        }
        
        setExchangingGdriveCode(true);
        try {
            const res = await apiClient.post('/api/integrations/gdrive/exchange', {
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
            showToast(formatApiError(err, 'Failed to exchange authorization code.'), 'error');
        } finally {
            setExchangingGdriveCode(false);
        }
    };

    const handleDisconnectGdrive = async () => {
        if (await confirm({ title: 'Disconnect Google Drive?', message: 'Are you sure you want to disconnect this Google Drive account?', confirmLabel: 'Disconnect' })) {
            setIntegrationsSettings(prev => ({
                ...prev,
                gdrive_refresh_token: '',
                gdrive_email: '',
                drive_enabled: 0
            }));
            showToast('Google Drive account disconnected. Make sure to save settings to persist.', 'info');
        }
    };

    const getAdditionalEmailsCount = () => {
        try {
            return JSON.parse(integrationsSettings.additional_emails || '[]').length;
        } catch(e) {
            return 0;
        }
    };

    const getAdditionalEmailsList = () => {
        try {
            return JSON.parse(integrationsSettings.additional_emails || '[]');
        } catch(e) {
            return [];
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            <ConfirmDialog {...confirmDialogProps} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <button
                    onClick={() => saveIntegrationsSettings(true)} 
                    className="btn" 
                    style={{ background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {/* Custom styled Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <button 
                    onClick={() => setActiveTab('mail')}
                    style={{
                        padding: '10px 20px', border: 'none', borderRadius: '6px',
                        background: activeTab === 'mail' ? 'rgba(var(--sky-rgb), 0.15)' : 'transparent',
                        color: activeTab === 'mail' ? 'var(--gold)' : 'var(--text-dim)',
                        fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Mail size={16} /> Candidate Email Sync
                </button>
                <button 
                    onClick={() => setActiveTab('drive')}
                    style={{
                        padding: '10px 20px', border: 'none', borderRadius: '6px',
                        background: activeTab === 'drive' ? 'rgba(var(--sky-rgb), 0.15)' : 'transparent',
                        color: activeTab === 'drive' ? 'var(--gold)' : 'var(--text-dim)',
                        fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Folder size={16} /> Google Drive Storage
                </button>
            </div>

            <div className="card" style={{ padding: '24px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                {activeTab === 'mail' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Enable switch */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: 8, background: 'rgba(var(--sky-rgb), 0.05)', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>Enable Candidate Email Sync</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Polls Email unseen messages for attached resumes matching keywords.</div>
                            </div>
                            <label className="switch-container">
                                <input
                                    type="checkbox"
                                    className="switch-input"
                                    checked={integrationsSettings.email_enabled === 1}
                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, email_enabled: e.target.checked ? 1 : 0 }))}
                                    aria-label="Enable candidate email sync"
                                />
                                <span className="switch-slider"></span>
                            </label>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: integrationsSettings.email_enabled === 1 ? 1 : 0.5, pointerEvents: integrationsSettings.email_enabled === 1 ? 'auto' : 'none' }}>
                            {/* Gmail Integration Credentials */}
                            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 style={{ margin: 0, color: 'var(--gold)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Mail size={16} /> Gmail Integration
                                    </h3>
                                    <label className="switch-container sm">
                                        <input
                                            type="checkbox"
                                            className="switch-input"
                                            checked={integrationsSettings.gmail_enabled === 1}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, gmail_enabled: e.target.checked ? 1 : 0 }))}
                                            aria-label="Enable Gmail integration"
                                        />
                                        <span className="switch-slider"></span>
                                    </label>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, opacity: integrationsSettings.gmail_enabled === 1 ? 1 : 0.5, pointerEvents: integrationsSettings.gmail_enabled === 1 ? 'auto' : 'none' }}>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Gmail Address</label>
                                        <input 
                                            value={integrationsSettings.gmail_email || ''}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, gmail_email: e.target.value }))}
                                            placeholder="hr@gmail.com"
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>App Password</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showSecrets.gmail_pass ? 'text' : 'password'}
                                                value={integrationsSettings.gmail_pass || ''}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, gmail_pass: e.target.value }))}
                                                placeholder={integrationsSettings.gmail_pass === '****' ? '                ' : '16-character app password'}
                                                style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                            />
                                            <button type="button" onClick={() => toggleSecretVisible('gmail_pass')}
                                                aria-label={showSecrets.gmail_pass ? 'Hide app password' : 'Show app password'}
                                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}>
                                                {showSecrets.gmail_pass ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Stored encrypted. Once saved, this field shows as •••• and is never displayed again.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Outlook Integration Credentials */}
                            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 style={{ margin: 0, color: 'var(--gold)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Mail size={16} /> Outlook Integration
                                    </h3>
                                    <label className="switch-container sm">
                                        <input
                                            type="checkbox"
                                            className="switch-input"
                                            checked={integrationsSettings.outlook_enabled === 1}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, outlook_enabled: e.target.checked ? 1 : 0 }))}
                                            aria-label="Enable Outlook integration"
                                        />
                                        <span className="switch-slider"></span>
                                    </label>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, opacity: integrationsSettings.outlook_enabled === 1 ? 1 : 0.5, pointerEvents: integrationsSettings.outlook_enabled === 1 ? 'auto' : 'none' }}>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Outlook Email Address</label>
                                        <input 
                                            value={integrationsSettings.outlook_email || ''}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, outlook_email: e.target.value }))}
                                            placeholder="hr@alamaticz.com"
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Application ID (Client ID)</label>
                                        <input 
                                            value={integrationsSettings.ms_client_id || ''}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, ms_client_id: e.target.value }))}
                                            placeholder="00000000-0000-0000-0000-000000000000"
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Tenant ID</label>
                                        <input 
                                            value={integrationsSettings.ms_tenant_id || ''}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, ms_tenant_id: e.target.value }))}
                                            placeholder="common or tenant id"
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Client Secret</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showSecrets.ms_client_secret ? 'text' : 'password'}
                                                value={integrationsSettings.ms_client_secret || ''}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, ms_client_secret: e.target.value }))}
                                                placeholder={integrationsSettings.ms_client_secret === '****' ? '                ' : 'Client Secret Value'}
                                                style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                            />
                                            <button type="button" onClick={() => toggleSecretVisible('ms_client_secret')}
                                                aria-label={showSecrets.ms_client_secret ? 'Hide client secret' : 'Show client secret'}
                                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}>
                                                {showSecrets.ms_client_secret ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Stored encrypted. Once saved, this field shows as •••• and is never displayed again.</p>
                                    </div>
                                </div>
                            </div>

                                {/* Keywords List */}
                                <div style={{ marginBottom: 16 }}>
                                    <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Subject/Filename Match Keywords</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: 10, background: 'rgba(var(--navy-dark-rgb), 0.2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        {(integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : []).map(kw => (
                                            <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(var(--sky-rgb), 0.15)', border: '1px solid rgba(var(--sky-rgb), 0.3)', color: 'var(--sky-dim)', fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6 }}>
                                                {kw}
                                                <button 
                                                    onClick={() => {
                                                        const kws = integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean);
                                                        const updated = kws.filter(x => x !== kw).join(', ');
                                                        setIntegrationsSettings(prev => ({ ...prev, keywords: updated }));
                                                    }}
                                                    aria-label={`Remove keyword "${kw}"`}
                                                    style={{ border: 'none', background: 'none', color: 'var(--sky-dim)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                        {(integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : []).length === 0 && (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No keywords yet. Press Enter or comma to add.</span>
                                        )}
                                    </div>
                                    <input 
                                        placeholder="Add keyword and press enter"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ',') {
                                                e.preventDefault();
                                                const val = e.currentTarget.value.trim();
                                                if (val) {
                                                    const kws = integrationsSettings.keywords ? integrationsSettings.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
                                                    if (!kws.includes(val)) {
                                                        const updated = [...kws, val].join(', ');
                                                        setIntegrationsSettings(prev => ({ ...prev, keywords: updated }));
                                                    }
                                                }
                                                e.currentTarget.value = '';
                                            }
                                        }}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                    />
                                </div>

                                {/* Advanced Connection Settings */}
                                <details style={{ cursor: 'pointer', background: 'rgba(var(--navy-dark-rgb), 0.4)', border: '1px solid rgba(var(--sky-rgb), 0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                                    <summary style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>Advanced IMAP/SMTP Connection Details</summary>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>IMAP Host</label>
                                            <input 
                                                value={integrationsSettings.imap_host || ''}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, imap_host: e.target.value }))}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>IMAP Port</label>
                                            <input 
                                                type="number"
                                                value={integrationsSettings.imap_port || 993}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>SMTP Host</label>
                                            <input 
                                                value={integrationsSettings.smtp_host || ''}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>SMTP Port</label>
                                            <input 
                                                type="number"
                                                value={integrationsSettings.smtp_port || 587}
                                                onChange={e => setIntegrationsSettings(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                    </div>
                                </details>

                                {/* Connection test */}
                                <div style={{ 
                                    padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: testStatus.status === 'connected' ? 'rgba(74, 222, 128, 0.08)' : 
                                                testStatus.status === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.15)',
                                    border: '1px solid ' + (
                                                testStatus.status === 'connected' ? 'rgba(74, 222, 128, 0.3)' : 
                                                testStatus.status === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'
                                            )
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {testingConnection ? (
                                            <Loader size={16} className="spin" color="var(--gold)" />
                                        ) : testStatus.status === 'connected' ? (
                                            <Check size={16} color="var(--success-fg)" />
                                        ) : testStatus.status === 'error' ? (
                                            <X size={16} color="var(--danger-fg)" />
                                        ) : (
                                            <span style={{ fontSize: '0.78rem' }}>ℹ️</span>
                                        )}
                                        <span style={{ 
                                            fontSize: '0.78rem',
                                            color: testStatus.status === 'connected' ? 'var(--success-fg)' : 
                                                   testStatus.status === 'error' ? 'var(--danger-fg)' : 'var(--text)'
                                        }}>
                                            {testStatus.message || 'Primary mailbox connection has not been tested.'}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={runConnectionTest} 
                                        disabled={testingConnection || !integrationsSettings.email_enabled}
                                        className="btn btn-secondary"
                                        style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}
                                    >
                                        {testingConnection ? 'Testing...' : 'Test Connection'}
                                    </button>
                                </div>

                            {/* Additional Mailboxes List */}
                            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 10px 0', color: 'var(--gold)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <Users size={14} /> Additional HR/Sync Mailboxes ({getAdditionalEmailsCount()})
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                                    {getAdditionalEmailsList().map((mailbox, index) => (
                                        <div key={index} style={{ 
                                            display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', 
                                            background: 'rgba(var(--navy-rgb), 0.3)', 
                                            border: '1px solid var(--border)', borderRadius: 8 
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                                                        <input 
                                                            type="checkbox"
                                                            checked={mailbox.email_enabled !== 0}
                                                            onChange={() => handleToggleMailbox(index)}
                                                        />
                                                        <strong style={{ fontSize: '0.85rem', color: mailbox.email_enabled !== 0 ? 'var(--text)' : 'var(--text-dim)' }}>{mailbox.email_user}</strong>
                                                    </label>
                                                    <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-dim)' }}>
                                                        Port {mailbox.imap_port}
                                                    </span>
                                                </div>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-secondary" 
                                                    onClick={() => handleDeleteMailbox(index)}
                                                    style={{ color: 'var(--danger-fg)', borderColor: 'rgba(var(--red-rgb), 0.2)', padding: '4px 8px', fontSize: '0.7rem' }}
                                                >
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.1)', padding: '6px 10px', borderRadius: 6 }}>
                                                <span style={{ 
                                                    fontSize: '0.72rem',
                                                    color: mailboxTestStatuses[index]?.status === 'connected' ? 'var(--success-fg)' : 
                                                           mailboxTestStatuses[index]?.status === 'error' ? 'var(--danger-fg)' : 'var(--text-dim)'
                                                }}>
                                                    {mailboxTestStatuses[index] ? (
                                                        <>
                                                            {mailboxTestStatuses[index].status === 'connected' ? '✔' : '✘'} {mailboxTestStatuses[index].message}
                                                        </>
                                                    ) : 'Not tested.'}
                                                </span>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-secondary" 
                                                    disabled={testingMailbox !== null}
                                                    onClick={() => testMailboxConnection(mailbox, index)}
                                                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                                >
                                                    {testingMailbox === index ? 'Testing...' : 'Test'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {getAdditionalEmailsCount() === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', padding: '16px 0' }}>
                                            No additional shared mailboxes added yet.
                                        </div>
                                    )}
                                </div>

                                {/* Add Connection Card */}
                                <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 16 }}>
                                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--text)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Add New Shared Mailbox</h4>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 6 }}>Email Provider</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {['Gmail', 'Outlook', 'Custom'].map(provider => {
                                                let isActive = false;
                                                if (provider === 'Gmail' && newEmailForm.imap_host?.includes('gmail')) isActive = true;
                                                else if (provider === 'Outlook' && newEmailForm.imap_host?.includes('office365')) isActive = true;
                                                else if (provider === 'Custom' && !newEmailForm.imap_host?.includes('gmail') && !newEmailForm.imap_host?.includes('office365')) isActive = true;
                                                
                                                return (
                                                    <button
                                                        key={provider}
                                                        type="button"
                                                        onClick={() => {
                                                            if (provider === 'Gmail') {
                                                                setNewEmailForm(prev => ({ ...prev, imap_host: 'imap.gmail.com', smtp_host: 'smtp.gmail.com', imap_port: 993, smtp_port: 587 }))
                                                            } else if (provider === 'Outlook') {
                                                                setNewEmailForm(prev => ({ ...prev, imap_host: 'outlook.office365.com', smtp_host: 'smtp.office365.com', imap_port: 993, smtp_port: 587 }))
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                                            border: isActive ? '1px solid var(--gold)' : '1px solid var(--border)',
                                                            background: isActive ? 'rgba(var(--sky-rgb), 0.15)' : 'rgba(0,0,0,0.2)',
                                                            color: isActive ? 'var(--gold)' : 'var(--text-dim)'
                                                        }}
                                                    >
                                                        {provider}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>Email Address</label>
                                            <input 
                                                value={newEmailForm.email_user}
                                                onChange={e => handleAdditionalEmailChange(e.target.value)}
                                                placeholder="sync@company.com"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                            />
                                        </div>
                                        {newEmailForm.imap_host?.includes('office365') ? (
                                            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                                                Uses global Microsoft Graph API settings configured in Primary Mailbox.
                                            </div>
                                        ) : (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>App Password</label>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        type={showSecrets.new_email_pass ? 'text' : 'password'}
                                                        value={newEmailForm.email_pass}
                                                        onChange={e => setNewEmailForm(prev => ({ ...prev, email_pass: e.target.value }))}
                                                        placeholder="app password"
                                                        style={{ width: '100%', padding: '8px 36px 8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                                    />
                                                    <button type="button" onClick={() => toggleSecretVisible('new_email_pass')}
                                                        aria-label={showSecrets.new_email_pass ? 'Hide app password' : 'Show app password'}
                                                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}>
                                                        {showSecrets.new_email_pass ? <EyeOff size={13} /> : <Eye size={13} />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <details style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.1)', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                                        <summary style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Config (Auto-detects Gmail/Outlook)</summary>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>IMAP Host</label>
                                                <input 
                                                    value={newEmailForm.imap_host}
                                                    onChange={e => setNewEmailForm(prev => ({ ...prev, imap_host: e.target.value }))}
                                                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.75rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>IMAP Port</label>
                                                <input 
                                                    type="number"
                                                    value={newEmailForm.imap_port}
                                                    onChange={e => setNewEmailForm(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))}
                                                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.75rem' }}
                                                />
                                            </div>
                                        </div>
                                    </details>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <button 
                                            type="button" 
                                            className="btn btn-secondary" 
                                            disabled={testingMailbox !== null}
                                            onClick={() => testMailboxConnection(newEmailForm, 'new')}
                                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                        >
                                            {testingMailbox === 'new' ? 'Testing...' : 'Test Connection'}
                                        </button>
                                        
                                        <button 
                                            type="button" 
                                            className="btn" 
                                            onClick={handleAddMailbox}
                                            style={{ background: 'var(--sky)', color: 'var(--action-fg)', border: 'none', padding: '6px 12px', fontSize: '0.75rem', borderRadius: 6, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                        >
                                            <Plus size={14} /> Add Mailbox
                                        </button>
                                    </div>
                                    {mailboxTestStatuses['new'] && (
                                        <div style={{ 
                                            marginTop: 10, fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6,
                                            color: mailboxTestStatuses['new'].status === 'connected' ? 'var(--success-fg)' : 'var(--danger-fg)',
                                            background: mailboxTestStatuses['new'].status === 'connected' ? 'rgba(74,222,128,0.06)' : 'rgba(239,68,68,0.06)'
                                        }}>
                                            {mailboxTestStatuses['new'].status === 'connected' ? '✔' : '✘'} {mailboxTestStatuses['new'].message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'drive' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Google Drive Status/Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: 8, background: 'rgba(var(--sky-rgb), 0.05)', border: '1px solid rgba(var(--sky-rgb), 0.15)' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>Enable Google Drive Sync</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Automatically upload processed candidate resumes to your Google Drive folder.</div>
                            </div>
                            <label className="switch-container" style={{ opacity: !integrationsSettings.gdrive_refresh_token ? 0.5 : 1, cursor: !integrationsSettings.gdrive_refresh_token ? 'not-allowed' : 'pointer' }}>
                                <input
                                    type="checkbox"
                                    className="switch-input"
                                    checked={integrationsSettings.drive_enabled === 1}
                                    disabled={!integrationsSettings.gdrive_refresh_token}
                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, drive_enabled: e.target.checked ? 1 : 0 }))}
                                    aria-label="Enable Google Drive sync"
                                />
                                <span className="switch-slider"></span>
                            </label>
                        </div>
                        
                        {!integrationsSettings.gdrive_refresh_token && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid rgba(var(--red-rgb), 0.3)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--danger-fg)' }}>
                                <AlertCircle size={14} style={{ flexShrink: 0 }} /> Google Drive is not authorized. Please complete the authorization process below before enabling sync.
                            </div>
                        )}

                        {/* Setup instructions with direct URLs */}
                        <div style={{ 
                            padding: '14px 16px', 
                            background: 'rgba(var(--sky-rgb), 0.04)', 
                            border: '1px solid rgba(var(--sky-rgb), 0.15)', 
                            borderRadius: 8, 
                            fontSize: '0.8rem', 
                            color: 'var(--text-dim)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10
                        }}>
                            <div style={{ fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                ℹ️ Google Drive Integration Setup Guide
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: '1.5' }}>
                                <li>
                                    Enable the <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Google Drive API <ExternalLink size={12} /></a> in your Google Cloud Console.
                                </li>
                                <li>
                                    Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Credentials page <ExternalLink size={12} /></a>, click <strong>Create Credentials</strong> &gt; <strong>OAuth Client ID</strong>, select <strong>Web application</strong>.
                                </li>
                                <li>
                                    Add <code>http://localhost</code> to the <strong>Authorized redirect URIs</strong>.
                                </li>
                                <li>
                                    Folder ID: Create or open a folder on <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky-dim)', fontWeight: 600, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Google Drive <ExternalLink size={12} /></a>, and copy the long folder ID from the end of the URL.
                                </li>
                            </ul>
                        </div>

                        {/* Credentials Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>Google Client ID</label>
                                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Find Key ↗</a>
                                    </div>
                                    <input 
                                        value={integrationsSettings.gdrive_client_id || ''}
                                        onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_client_id: e.target.value }))}
                                        placeholder="Enter your OAuth 2.0 Client ID"
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>Google Client Secret</label>
                                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Find Secret ↗</a>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showSecrets.gdrive_client_secret ? 'text' : 'password'}
                                            value={integrationsSettings.gdrive_client_secret || ''}
                                            onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_client_secret: e.target.value }))}
                                            placeholder={integrationsSettings.gdrive_client_secret === '****' ? '••••••••••••••••' : 'Enter your OAuth 2.0 Client Secret'}
                                            style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                        />
                                        <button type="button" onClick={() => toggleSecretVisible('gdrive_client_secret')}
                                            aria-label={showSecrets.gdrive_client_secret ? 'Hide client secret' : 'Show client secret'}
                                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}>
                                            {showSecrets.gdrive_client_secret ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Stored encrypted. Once saved, this field shows as •••• and is never displayed again.</p>
                                </div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label className="form-label" style={{ fontSize: '0.78rem', margin: 0 }}>Google Drive Target Folder ID</label>
                                    <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--sky-dim)', textDecoration: 'underline' }}>Open Drive ↗</a>
                                </div>
                                <input 
                                    value={integrationsSettings.gdrive_folder_id || ''}
                                    onChange={e => setIntegrationsSettings(prev => ({ ...prev, gdrive_folder_id: e.target.value }))}
                                    placeholder="Enter target Folder ID (leave empty for root directory)"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none' }}
                                />
                            </div>
                        </div>

                        {/* Authorization Area */}
                        <div style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                            <h4 style={{ margin: '0 0 16px 0', color: 'var(--gold)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04rem', display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={14} /> Google Drive Account Authorization</h4>
                            
                            {integrationsSettings.gdrive_email ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.3)', padding: '12px 16px', borderRadius: 8 }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Connected Account</div>
                                        <strong style={{ fontSize: '0.88rem', color: 'var(--success-fg)' }}>{integrationsSettings.gdrive_email}</strong>
                                    </div>
                                    <button 
                                        type="button" 
                                        className="btn btn-secondary" 
                                        onClick={handleDisconnectGdrive}
                                        style={{ color: 'var(--danger-fg)', borderColor: 'rgba(var(--red-rgb), 0.3)', padding: '8px 16px', fontSize: '0.8rem', height: 'fit-content' }}
                                    >
                                        Disconnect Account
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: 'var(--action-fg)', width: 22, height: 22, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.78rem' }}>1</span>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>Generate Authorization Link</span>
                                        <button 
                                            type="button" 
                                            className="btn btn-secondary" 
                                            onClick={handleGenerateGdriveAuthUrl}
                                            disabled={!integrationsSettings.gdrive_client_id}
                                            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '0.75rem' }}
                                        >
                                            Generate URL
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: 'var(--action-fg)', width: 22, height: 22, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.78rem' }}>2</span>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>Paste redirect URL or authorization code</span>
                                        </div>
                                        <input 
                                            value={gdriveAuthCode}
                                            onChange={e => setGdriveAuthCode(e.target.value)}
                                            placeholder="http://localhost/?code=4/0Af... or code value"
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: 'var(--action-fg)', width: 22, height: 22, borderRadius: '50%', fontWeight: 'bold', fontSize: '0.78rem' }}>3</span>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>Establish Google Drive credentials link</span>
                                        <button 
                                            type="button" 
                                            className="btn" 
                                            onClick={handleExchangeGdriveCode}
                                            disabled={exchangingGdriveCode || !gdriveAuthCode}
                                            style={{ marginLeft: 'auto', background: 'var(--gold)', color: 'var(--action-fg)', fontWeight: 'bold', border: 'none', padding: '6px 14px', fontSize: '0.75rem', borderRadius: 6, cursor: 'pointer' }}
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
        </div>
    )
}
