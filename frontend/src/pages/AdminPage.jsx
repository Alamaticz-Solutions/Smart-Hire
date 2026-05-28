import { useState, useEffect } from 'react'
import axios from 'axios'
import { Shield, CheckCircle, XCircle, UserCheck, Trash2 } from 'lucide-react'

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState('requests') // requests | users
    const [requests, setRequests] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (activeTab === 'requests') {
            fetchRequests()
        } else {
            fetchUsers()
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
        </div>
    )
}
