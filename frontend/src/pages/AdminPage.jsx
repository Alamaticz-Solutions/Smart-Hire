import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import axios from 'axios'
import { Shield, CheckCircle, XCircle, UserCheck, Trash2, UserPlus, Check } from 'lucide-react'

export default function AdminPage() {
    const { user, onUpdateUser } = useOutletContext()
    const [activeTab, setActiveTab] = useState('requests') // requests | users | matrix
    const [requests, setRequests] = useState([])
    const [users, setUsers] = useState([])
    const [teamMembers, setTeamMembers] = useState([])
    const [newMemberName, setNewMemberName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (activeTab === 'requests') {
            fetchRequests()
        } else if (activeTab === 'users') {
            fetchUsers()
        } else if (activeTab === 'matrix') {
            fetchTeamMembers()
        }
    }, [activeTab])

    const fetchRequests = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await axios.get('/api/admin/requests')
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
            const res = await axios.get('/api/admin/users')
            setUsers(res.data || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load users.')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (id) => {
        try {
            await axios.post(`/api/admin/requests/${id}/approve`)
            fetchRequests()
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to approve request')
        }
    }

    const handleReject = async (id) => {
        try {
            await axios.post(`/api/admin/requests/${id}/reject`)
            fetchRequests()
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to reject request')
        }
    }

    const toggleRole = async (id, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin'
        try {
            await axios.put(`/api/admin/users/${id}/role`, { role: newRole })
            fetchUsers()
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to update user role')
        }
    }

    const handleDeleteUser = async (id, username) => {
        if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return
        try {
            await axios.delete(`/api/admin/users/${id}`)
            fetchUsers()
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to delete user')
        }
    }

    const fetchTeamMembers = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await axios.get('/api/team-members')
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
            await axios.post('/api/activity', { 
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
            await axios.post('/api/team-members', { name })
            setNewMemberName('')
            fetchTeamMembers()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add team member.')
        }
    }

    const handleDeleteTeamMember = async (id, name) => {
        if (!window.confirm(`Are you sure you want to remove "${name}" from the recruiter persona matrix?`)) return
        setError(null)
        try {
            await axios.delete(`/api/team-members/${id}`)
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
                <button 
                    onClick={() => setActiveTab('matrix')}
                    style={{
                        padding: '0.8rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === 'matrix' ? 'var(--gold)' : 'var(--text-dim)',
                        borderBottom: activeTab === 'matrix' ? '2px solid var(--gold)' : '2px solid transparent',
                        fontWeight: activeTab === 'matrix' ? 'bold' : 'normal', fontSize: '1rem'
                    }}
                >
                    Recruiter Persona Matrix
                </button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Loading data...</div>}
            {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            {/* Requests Tab */}
            {!loading && activeTab === 'requests' && (
                <div className="grid">
                    {requests.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', width: '100%' }}>No pending requests.</div>
                    ) : (
                        requests.map(req => (
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
                                    <button className="btn btn-danger" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '0.5rem', background: '#e74c3c' }} onClick={() => handleReject(req.id)}>
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
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--bg-darker)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '1rem' }}>Username</th>
                                <th style={{ padding: '1rem' }}>Full Name</th>
                                <th style={{ padding: '1rem' }}>Role</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.username} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '1rem', fontWeight: '500' }}>{u.username}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-dim)' }}>{u.full_name}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{ 
                                            padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                                            background: u.role === 'admin' ? 'rgba(var(--gold-rgb), 0.2)' : 'rgba(var(--sky-dim-rgb), 0.1)',
                                            color: u.role === 'admin' ? 'var(--gold)' : 'var(--text-dim)'
                                        }}>
                                            {u.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                                onClick={() => toggleRole(u.id, u.role)}
                                            >
                                                <UserCheck size={14} /> Make {u.role === 'admin' ? 'User' : 'Admin'}
                                            </button>
                                            <button 
                                                className="btn btn-danger" 
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#e74c3c' }}
                                                onClick={() => handleDeleteUser(u.id, u.username)}
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No users found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Matrix Tab */}
            {!loading && activeTab === 'matrix' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Add Recruiter Card Form */}
                    <div className="card" style={{
                        maxWidth: '500px',
                        background: 'rgba(var(--navy-dark-rgb), 0.25)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', color: 'var(--gold)' }}>
                            ➕ Add Recruiter to Matrix
                        </h3>
                        <form onSubmit={handleAddTeamMember} style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                className="form-input"
                                style={{ flex: 1, margin: 0 }}
                                placeholder="Recruiter name (e.g. Sekhar)"
                                value={newMemberName}
                                onChange={e => setNewMemberName(e.target.value)}
                            />
                            <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <UserPlus size={16} /> Add
                            </button>
                        </form>
                    </div>

                    {/* Persona Grid Matrix */}
                    <div>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text)' }}>
                            ⚡ Recruiter Personas
                        </h3>
                        
                        {teamMembers.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                No recruiter personas found. Add one above!
                            </div>
                        ) : (
                            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                                {teamMembers.map(member => {
                                    const isActive = user?.active_persona === member.name;
                                    return (
                                        <div
                                            key={member.id}
                                            onClick={() => handleSelectPersona(member.name)}
                                            style={{
                                                background: isActive ? 'rgba(251, 133, 0, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
                                                border: isActive ? '2.5px solid #FB8500' : '1px solid var(--border)',
                                                borderRadius: '12px',
                                                padding: '20px 16px',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                position: 'relative',
                                                boxShadow: isActive ? '0 0 20px rgba(251, 133, 0, 0.2)' : 'none',
                                                transform: isActive ? 'scale(1.02)' : 'none'
                                            }}
                                            onMouseEnter={e => {
                                                if (!isActive) {
                                                    e.currentTarget.style.borderColor = 'var(--gold)';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                }
                                            }}
                                            onMouseLeave={e => {
                                                if (!isActive) {
                                                    e.currentTarget.style.borderColor = 'var(--border)';
                                                    e.currentTarget.style.transform = 'none';
                                                }
                                            }}
                                        >
                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTeamMember(member.id, member.name);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '12px',
                                                    right: '12px',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    color: '#ef4444',
                                                    borderRadius: '6px',
                                                    width: '28px',
                                                    height: '28px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                                                    e.currentTarget.style.borderColor = '#ef4444';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                                }}
                                                title="Remove recruiter from matrix"
                                            >
                                                <Trash2 size={13} />
                                            </button>

                                            {/* Avatar Badge */}
                                            <div style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '50%',
                                                background: isActive ? 'linear-gradient(135deg, #FB8500, #FFB703)' : 'rgba(255,255,255,0.06)',
                                                color: isActive ? '#fff' : 'var(--text-dim)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                margin: '8px auto 12px',
                                                fontWeight: 'bold',
                                                fontSize: '1.25rem',
                                                boxShadow: isActive ? '0 0 12px rgba(251, 133, 0, 0.35)' : 'none',
                                                transition: 'all 0.2s'
                                            }}>
                                                {member.name[0]?.toUpperCase()}
                                            </div>

                                            {/* Name */}
                                            <h4 style={{
                                                margin: '0 0 6px 0',
                                                fontSize: '1rem',
                                                fontWeight: '700',
                                                color: isActive ? 'var(--gold)' : 'var(--text)'
                                            }}>
                                                {member.name}
                                            </h4>

                                            {/* Status Indicator */}
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                                <span style={{
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    background: isActive ? '#FB8500' : 'rgba(255,255,255,0.25)',
                                                    display: 'inline-block'
                                                }}></span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.03rem',
                                                    color: isActive ? 'var(--gold)' : 'var(--text-dim)',
                                                    opacity: isActive ? 1 : 0.6
                                                }}>
                                                    {isActive ? 'Active Persona' : 'Inactive'}
                                                </span>
                                            </div>

                                            {isActive && (
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '-10px',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    background: '#FB8500',
                                                    borderRadius: '10px',
                                                    padding: '2px 8px',
                                                    fontSize: '0.62rem',
                                                    fontWeight: 'bold',
                                                    color: '#fff',
                                                    boxShadow: '0 2px 5px rgba(251, 133, 0, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px'
                                                }}>
                                                    <Check size={9} strokeWidth={4} /> ACTING RECRUITER
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
