import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Shield, CheckCircle, XCircle, UserCheck, Trash2, UserPlus, Check, Users, Search, EyeOff } from 'lucide-react'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'
import ToastHost from '../components/shared/ToastHost'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { useModalA11y } from '../hooks/useModalA11y'
import { SkeletonRows } from '../components/shared/Skeleton'

const CANDIDATE_FIELDS = [
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email Address' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'linkedin', label: 'LinkedIn Profile' },
    { key: 'ctc', label: 'Current CTC' },
    { key: 'expected_ctc', label: 'Expected CTC' },
    { key: 'percentage_hike', label: 'Hike %' },
    { key: 'notice_period', label: 'Notice Period' },
    { key: 'total_experience', label: 'Total Experience' },
    { key: 'pega_experience', label: 'Pega Experience' },
    { key: 'cdh_exp', label: 'CDH Experience' },
    { key: 'current_organization', label: 'Current Org' },
    { key: 'current_location', label: 'Current Location' },
    { key: 'pref_locations', label: 'Preferred Location' },
    { key: 'skills', label: 'Skills' },
    { key: 'certifications', label: 'Certifications' }
];

export default function AdminPage() {
    const { user, onUpdateUser } = useOutletContext()
    const { toast, showToast, dismissToast, pauseToast, resumeToast } = useToast()
    const { confirm, confirmDialogProps } = useConfirm()
    const [activeTab, setActiveTab] = useState('requests') // requests | users | matrix
    const [requests, setRequests] = useState([])
    const [users, setUsers] = useState([])
    const [teamMembers, setTeamMembers] = useState([])
    const [newMemberName, setNewMemberName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [userSearchQuery, setUserSearchQuery] = useState('')
    const [keywords, setKeywords] = useState([])
    const [newKeyword, setNewKeyword] = useState('')
    
    const [selectedUserForHiddenFields, setSelectedUserForHiddenFields] = useState(null)
    const [tempHiddenFields, setTempHiddenFields] = useState([])
    const [showHiddenFieldsModal, setShowHiddenFieldsModal] = useState(false)
    const hiddenFieldsModalRef = useModalA11y(showHiddenFieldsModal, () => setShowHiddenFieldsModal(false))

    useEffect(() => {
        if (activeTab === 'requests') {
            fetchRequests()
        } else if (activeTab === 'users') {
            fetchUsers()
        } else if (activeTab === 'matrix') {
            fetchTeamMembers()
        } else if (activeTab === 'keywords') {
            fetchKeywords()
        }
    }, [activeTab])

    const fetchRequests = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await apiClient.get('/api/admin/requests')
            setRequests(res.data || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load change requests.')
        } finally {
            setLoading(false)
        }
    }

    const fetchUsers = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await apiClient.get('/api/admin/users')
            setUsers(res.data || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load users.')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (id) => {
        try {
            await apiClient.post(`/api/admin/requests/${id}/approve`)
            fetchRequests()
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to approve request', 'error')
        }
    }

    const handleReject = async (id) => {
        try {
            await apiClient.post(`/api/admin/requests/${id}/reject`)
            fetchRequests()
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to reject request', 'error')
        }
    }

    const togglePermission = async (id, field, currentValue) => {
        const targetUser = users.find(u => u.id === id)
        if (!targetUser) return

        if (targetUser.username === user.username && field === 'is_admin' && currentValue === 1) {
            const ok = await confirm({
                title: 'Remove your own admin access?',
                message: 'If you remove your Admin permission, you will lose access to the Admin Portal. Are you sure you want to proceed?',
                confirmLabel: 'Remove admin access',
            })
            if (!ok) return
        }

        let isHrValue = targetUser.is_hr
        let isAdminValue = targetUser.is_admin
        let isExternalValue = targetUser.is_external || 0
        let isApprovedValue = targetUser.is_approved

        if (field === 'is_approved') {
            isApprovedValue = currentValue === 1 ? 0 : 1
        } else if (field === 'is_hr') {
            isHrValue = currentValue === 1 ? 0 : 1
            if (isHrValue === 1) {
                isExternalValue = 0
                isApprovedValue = 1
            }
        } else if (field === 'is_admin') {
            isAdminValue = currentValue === 1 ? 0 : 1
            if (isAdminValue === 1) {
                isExternalValue = 0
                isApprovedValue = 1
            }
        } else if (field === 'is_external') {
            isExternalValue = currentValue === 1 ? 0 : 1
            if (isExternalValue === 1) {
                isHrValue = 0
                isAdminValue = 0
                isApprovedValue = 1
            }
        }

        try {
            await apiClient.put(`/api/admin/users/${id}/permissions`, { 
                is_hr: isHrValue, 
                is_admin: isAdminValue,
                is_external: isExternalValue,
                is_approved: isApprovedValue
            })
            if (targetUser.username === user.username) {
                onUpdateUser({ 
                    ...user, 
                    is_hr: isHrValue, 
                    is_admin: isAdminValue,
                    is_external: isExternalValue,
                    is_approved: isApprovedValue,
                    role: isAdminValue === 1 ? 'admin' : 'user'
                })
            }
            fetchUsers()
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to update user permissions', 'error')
        }
    }

    const updateUserHiddenFields = async (id, hiddenFields) => {
        const targetUser = users.find(u => u.id === id)
        if (!targetUser) return
        
        try {
            await apiClient.put(`/api/admin/users/${id}/permissions`, { 
                is_hr: targetUser.is_hr, 
                is_admin: targetUser.is_admin,
                is_external: targetUser.is_external || 0,
                hidden_fields: hiddenFields
            })
            fetchUsers()
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to update user hidden fields', 'error')
        }
    }

    const handleDeleteUser = async (id, username) => {
        if (!await confirm({
            title: 'Delete user?',
            message: `This permanently removes "${username}"'s account, including their access history and any candidates or jobs attributed to them. This cannot be undone.`,
            confirmLabel: 'Delete',
            confirmText: username,
        })) return
        try {
            await apiClient.delete(`/api/admin/users/${id}`)
            fetchUsers()
        } catch (err) {
            showToast(err.response?.data?.detail || 'Failed to delete user', 'error')
        }
    }

    const fetchKeywords = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await apiClient.get('/api/admin/masked-keywords')
            setKeywords(res.data || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load masked keywords.')
        } finally {
            setLoading(false)
        }
    }

    const handleAddKeyword = async (e) => {
        e.preventDefault()
        const kw = newKeyword.trim()
        if (!kw) return
        setError(null)
        try {
            await apiClient.post('/api/admin/masked-keywords', { keyword: kw })
            setNewKeyword('')
            fetchKeywords()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add masked keyword.')
        }
    }

    const handleDeleteKeyword = async (kw) => {
        if (!await confirm({ title: 'Remove masked keyword?', message: `Are you sure you want to remove "${kw}" from masked keywords?`, confirmLabel: 'Remove' })) return
        setError(null)
        try {
            await apiClient.delete(`/api/admin/masked-keywords/${encodeURIComponent(kw)}`, { headers: { 'x-user-username': user?.username } })
            fetchKeywords()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete masked keyword.')
        }
    }

    const fetchTeamMembers = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await apiClient.get('/api/team-members')
            setTeamMembers(res.data || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load team members.')
        } finally {
            setLoading(false)
        }
    }

    const handleSelectPersona = async (memberName) => {
        const isActive = user?.active_persona === memberName;
        const newPersona = isActive ? null : memberName;
        
        try {
            const actionText = newPersona 
                ? `is now the active recruiter persona` 
                : `reverted to system admin`;
            await apiClient.post('/api/activity', { 
                username: memberName, 
                action: actionText 
            });
        } catch (err) {
            console.error("Failed to log persona shift activity", err);
        }

        onUpdateUser({ ...user, active_persona: newPersona });
    }

    const handleAddTeamMember = async (e) => {
        e.preventDefault()
        const name = newMemberName.trim()
        if (!name) return
        setError(null)
        try {
            await apiClient.post('/api/team-members', { name })
            setNewMemberName('')
            fetchTeamMembers()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add team member.')
        }
    }

    const handleDeleteTeamMember = async (id, name) => {
        if (!await confirm({ title: 'Remove team member?', message: `Are you sure you want to remove "${name}" from the recruiter persona matrix?`, confirmLabel: 'Remove' })) return
        setError(null)
        try {
            await apiClient.delete(`/api/team-members/${id}`, { headers: { 'x-user-username': user?.username } })
            if (user?.active_persona === name) {
                onUpdateUser({ ...user, active_persona: null })
            }
            fetchTeamMembers()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete team member.')
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title"><Shield size={28} style={{ marginRight: '10px', verticalAlign: 'middle', color: 'var(--gold)' }} />Admin Portal</h1>
                    <p className="page-subtitle">Manage system changes, user roles, and access control.</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)' }}>
                <button 
                    onClick={() => setActiveTab('requests')}
                    style={{
                        padding: '0.8rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === 'requests' ? 'var(--gold)' : 'var(--text-dim)',
                        borderBottom: activeTab === 'requests' ? '2px solid var(--gold)' : '2px solid transparent',
                        fontWeight: activeTab === 'requests' ? 'bold' : 'normal', fontSize: '1rem'
                    }}
                >
                    Pending Requests
                </button>
                <button 
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '0.8rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === 'users' ? 'var(--gold)' : 'var(--text-dim)',
                        borderBottom: activeTab === 'users' ? '2px solid var(--gold)' : '2px solid transparent',
                        fontWeight: activeTab === 'users' ? 'bold' : 'normal', fontSize: '1rem'
                    }}
                >
                    User Management
                </button>

            </div>

            {/* G-21: was plain "Loading data..." text - the one other loading
                idiom besides Dashboard's spinner and Upload's button labels. */}
            {loading && <div style={{ padding: '1.5rem 0' }} aria-busy="true" aria-label="Loading users"><SkeletonRows count={5} height={44} /></div>}
            {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            {/* Requests Tab */}
            {!loading && activeTab === 'requests' && (
                <div className="grid">
                    {requests.filter(r => r.status === 'pending').length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', width: '100%' }}>No pending requests.</div>
                    ) : (
                        requests.filter(r => r.status === 'pending').map(req => (
                            <div key={req.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', textTransform: 'capitalize' }}>
                                        {req.action_type ? req.action_type.replace('_', ' ') : 'Change'} Request
                                    </span>
                                    {req.target_id && (
                                        <span style={{ background: 'rgba(var(--sky-dim-rgb), 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                                            ID: {req.target_id}
                                        </span>
                                    )}
                                </div>
                                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                    <strong>Requested by:</strong> {req.username}
                                </div>
                                {req.description && (
                                    <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>
                                        <strong>Description:</strong> {req.description}
                                    </div>
                                )}
                                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                    <strong>Created At:</strong> {new Date(req.created_at).toLocaleString()}
                                </div>
                                {req.payload && (
                                    <div style={{ background: 'var(--bg-darker)', padding: '0.8rem', borderRadius: '6px', fontSize: '0.85rem', overflowX: 'auto' }}>
                                        <pre style={{ margin: 0 }}>{JSON.stringify(JSON.parse(req.payload), null, 2)}</pre>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto', paddingTop: '1rem' }}>
                                    <button className="btn btn-primary" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '0.5rem' }} onClick={() => handleApprove(req.id)}>
                                        <CheckCircle size={16} /> Approve
                                    </button>
                                    <button className="btn btn-danger" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '0.5rem' }} onClick={() => handleReject(req.id)}>
                                        <XCircle size={16} /> Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Users Tab */}
            {!loading && activeTab === 'users' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* KPI mini-cards */}
                    <div className="user-stats-grid">
                        <div className="user-stat-card">
                            <div className="user-stat-icon-container">
                                <Users size={20} />
                            </div>
                            <div className="user-stat-info">
                                <span className="user-stat-value">{users.length}</span>
                                <span className="user-stat-label">Total Registered</span>
                            </div>
                        </div>
                        <div className="user-stat-card">
                            <div className="user-stat-icon-container" style={{ color: 'var(--info-fg)', background: 'var(--info-bg)', borderColor: 'rgba(var(--sky-rgb), 0.3)' }}>
                                <UserCheck size={20} />
                            </div>
                            <div className="user-stat-info">
                                <span className="user-stat-value">{users.filter(u => u.is_hr === 1).length}</span>
                                <span className="user-stat-label">HR Managers</span>
                            </div>
                        </div>
                        <div className="user-stat-card">
                            <div className="user-stat-icon-container" style={{ color: 'var(--warning-fg)', background: 'var(--warning-bg)', borderColor: 'rgba(var(--gold-rgb), 0.3)' }}>
                                <Shield size={20} />
                            </div>
                            <div className="user-stat-info">
                                <span className="user-stat-value">{users.filter(u => u.is_admin === 1).length}</span>
                                <span className="user-stat-label">System Admins</span>
                            </div>
                        </div>
                    </div>

                    {/* Filter and Table Control Card */}
                    <div className="user-table-card">
                        <div style={{ 
                            padding: '1.2rem 1.5rem', 
                            borderBottom: '1px solid var(--border)', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            background: 'rgba(var(--navy-dark-rgb), 0.3)'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 700 }}>Registered Users</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>Update permissions and manage access credentials.</p>
                            </div>
                            <div style={{ position: 'relative', width: '260px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search users..."
                                    style={{ margin: 0, paddingLeft: '34px', fontSize: '0.85rem' }}
                                    value={userSearchQuery}
                                    onChange={e => setUserSearchQuery(e.target.value)}
                                />
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', opacity: 0.7 }} />
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ background: 'rgba(var(--navy-rgb), 0.25)', borderBottom: '1px solid var(--border)' }}>
                                    <tr>
                                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.78rem' }}>User Profile</th>
                                        <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem' }}>HR</th>
                                        <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem' }}>Admin</th>
                                        <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem' }}>External</th>
                                        <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem' }}>Manage Fields</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right', fontSize: '0.78rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.filter(u => 
                                        u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
                                        u.full_name.toLowerCase().includes(userSearchQuery.toLowerCase())
                                    ).map(u => {
                                        const isSelf = u.username.toLowerCase() === user.username.toLowerCase();
                                        
                                        // Generate beautiful initials and avatar colors
                                        const initials = (u.full_name || u.username).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                                        let avatarBg = 'var(--text-subtle)'; // default
                                        if (u.is_admin === 1 && u.is_hr === 1) {
                                            avatarBg = 'var(--chart-3)'; // super-user
                                        } else if (u.is_admin === 1) {
                                            avatarBg = 'var(--chart-1)'; // admin
                                        } else if (u.is_hr === 1) {
                                            avatarBg = 'var(--chart-2)'; // HR manager
                                        } else if (u.is_external === 1) {
                                            avatarBg = 'var(--border-strong)'; // external
                                        }

                                        return (
                                            <tr key={u.username} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="table-user-row">
                                                <td style={{ padding: '1rem 1.5rem' }}>
                                                    <div className="user-cell-profile">
                                                        <div className="user-avatar-circle" style={{ background: avatarBg }}>
                                                            {initials}
                                                        </div>
                                                        <div className="user-info-text">
                                                            <span className="user-info-name">{u.full_name || 'Anonymous User'}</span>
                                                            <span className="user-info-username">@{u.username} {u.email ? `· ${u.email}` : ''}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <label className="switch-container">
                                                            <input
                                                                type="checkbox"
                                                                className="switch-input"
                                                                checked={u.is_hr === 1}
                                                                disabled={isSelf}
                                                                aria-label={`HR access for ${u.full_name || u.username}`}
                                                                onChange={() => togglePermission(u.id, 'is_hr', u.is_hr)}
                                                            />
                                                            <span className="switch-slider"></span>
                                                        </label>
                                                        <span className={`switch-label-tag ${u.is_hr === 1 ? 'active' : 'inactive'}`}>
                                                            {u.is_hr === 1 ? 'HR' : 'Off'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <label className="switch-container">
                                                            <input
                                                                type="checkbox"
                                                                className="switch-input"
                                                                checked={u.is_admin === 1}
                                                                disabled={isSelf}
                                                                aria-label={`Admin access for ${u.full_name || u.username}`}
                                                                onChange={() => togglePermission(u.id, 'is_admin', u.is_admin)}
                                                            />
                                                            <span className="switch-slider"></span>
                                                        </label>
                                                        <span className={`switch-label-tag ${u.is_admin === 1 ? 'active' : 'inactive'}`}>
                                                            {u.is_admin === 1 ? 'Admin' : 'Off'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <label className="switch-container">
                                                            <input
                                                                type="checkbox"
                                                                className="switch-input"
                                                                checked={u.is_external === 1}
                                                                disabled={isSelf}
                                                                aria-label={`External access for ${u.full_name || u.username}`}
                                                                onChange={() => togglePermission(u.id, 'is_external', u.is_external)}
                                                            />
                                                            <span className="switch-slider"></span>
                                                        </label>
                                                        <span className={`switch-label-tag ${u.is_external === 1 ? 'active' : 'inactive'}`}>
                                                            {u.is_external === 1 ? 'External' : 'Off'}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <button 
                                                        className="btn btn-secondary" 
                                                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: 'var(--border)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                                        onClick={() => {
                                                            setSelectedUserForHiddenFields(u);
                                                            setTempHiddenFields(u.hidden_fields ? u.hidden_fields.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : []);
                                                            setShowHiddenFieldsModal(true);
                                                        }}
                                                    >
                                                        {u.hidden_fields && u.hidden_fields.split(',').filter(Boolean).length > 0
                                                            ? <><EyeOff size={12} /> {u.hidden_fields.split(',').filter(Boolean).length} Hidden</>
                                                            : 'Configure'}
                                                    </button>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                        {isSelf ? (
                                                            <span className="current-user-badge">
                                                                <Check size={12} strokeWidth={3} /> You
                                                            </span>
                                                        ) : (
                                                            <button 
                                                                className="btn btn-danger" 
                                                                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '8px' }}
                                                                onClick={() => handleDeleteUser(u.id, u.username)}
                                                            >
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                                                    {users.filter(u => 
                                        u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
                                        u.full_name.toLowerCase().includes(userSearchQuery.toLowerCase())
                                    ).length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                                No users found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}




            {showHiddenFieldsModal && selectedUserForHiddenFields && (
                <div className="modal-overlay" onClick={() => setShowHiddenFieldsModal(false)}>
                    <div ref={hiddenFieldsModalRef} className="card" role="dialog" aria-modal="true" aria-labelledby="hidden-fields-modal-title" onClick={e => e.stopPropagation()} style={{
                        width: '90%', maxWidth: '500px', maxHeight: '85vh',
                        display: 'flex', flexDirection: 'column', padding: 0
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '20px 24px', background: 'rgba(var(--navy-dark-rgb), 0.4)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <h3 id="hidden-fields-modal-title" style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--fh)', fontSize: '1.1rem', fontWeight: 800 }}>
                                Hidden Candidate Fields for @{selectedUserForHiddenFields.username}
                            </h3>
                            <button onClick={() => setShowHiddenFieldsModal(false)} aria-label="Close" style={{
                                background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
                                color: 'var(--gold)', cursor: 'pointer', padding: 6, borderRadius: '8px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <XCircle size={18} />
                            </button>
                        </div>
                        <p style={{ margin: '0 24px 12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Uncheck a field to hide it from this user's candidate view.
                        </p>
                        <div style={{
                            flex: 1, padding: '0 24px 24px', overflowY: 'auto',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'
                        }}>
                            {CANDIDATE_FIELDS.map(f => {
                                // checked = "visible to this user" (S7.4: checkbox semantics
                                // matched their visual weight - checked+red used to mean
                                // "hidden", which read as the field being flagged/enabled).
                                const isVisible = !tempHiddenFields.includes(f.key);
                                return (
                                    <label key={f.key} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        fontSize: '0.88rem', color: isVisible ? 'var(--text)' : 'var(--warning-fg)',
                                        cursor: 'pointer', padding: '8px 12px', borderRadius: '6px',
                                        background: isVisible ? 'var(--surface-2)' : 'var(--warning-bg)',
                                        border: `1px solid ${isVisible ? 'transparent' : 'rgba(var(--gold-rgb), 0.3)'}`,
                                        transition: 'all 0.15s'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={isVisible}
                                            onChange={() => {
                                                setTempHiddenFields(prev =>
                                                    prev.includes(f.key)
                                                        ? prev.filter(k => k !== f.key)
                                                        : [...prev, f.key]
                                                );
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        {f.label}
                                    </label>
                                );
                            })}
                        </div>
                        <div style={{
                            padding: '16px 24px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end', gap: '12px',
                            background: 'rgba(var(--navy-rgb), 0.3)'
                        }}>
                            <button 
                                onClick={() => setShowHiddenFieldsModal(false)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={async () => {
                                    await updateUserHiddenFields(selectedUserForHiddenFields.id, tempHiddenFields.join(','));
                                    setShowHiddenFieldsModal(false);
                                }}
                                className="btn btn-primary"
                                style={{ padding: '6px 18px', fontSize: '0.8rem' }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ToastHost toast={toast} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
            <ConfirmDialog {...confirmDialogProps} />
        </div>
    )
}
