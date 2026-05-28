import { useState } from 'react'
import axios from 'axios'
import { Eye, EyeOff, Check } from 'lucide-react'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'

export default function LoginPage({ onLogin }) {
    const [mode, setMode] = useState('login')   // login | register | forgot | team-selection
    const [cred, setCred] = useState('')
    const [pass, setPass] = useState('')
    const [name, setName] = useState('')
    const [pass2, setPass2] = useState('')
    const [mobile, setMobile] = useState('')
    const [fpInput, setFpInput] = useState('')
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    const [showPass, setShowPass] = useState(false)
    const [showRegisterPass, setShowRegisterPass] = useState(false)
    const [showRegisterPass2, setShowRegisterPass2] = useState(false)
    const [selectedMember, setSelectedMember] = useState(null)

    const changeMode = (newMode) => {
        setMode(newMode)
        setError('')
        setInfo('')
        setShowPass(false)
        setShowRegisterPass(false)
        setShowRegisterPass2(false)
        setSelectedMember(null)
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!cred || !pass) { setError('Please enter your Username and Password.'); return }
        
        try {
            const res = await axios.post('/api/auth/login', { username: cred, password: pass })
            if (res.data.username.toLowerCase() === 'admin') {
                setMode('team-selection')
            } else {
                onLogin(res.data)
            }
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (Array.isArray(detail)) {
                setError(detail.map(d => d.msg).join(', '));
            } else if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError('Invalid username or password. (Is the backend server running?)');
            }
        }
    }

    const handleEnterPortal = async () => {
        if (!selectedMember) return;
        try {
            await axios.post('/api/activity', { username: selectedMember, action: 'logged in to the portal' })
        } catch (err) {
            console.error("Failed to log activity", err);
        }
        onLogin({ username: selectedMember, full_name: selectedMember, role: 'admin' })
    }

    const handleRegister = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!name || !cred || !pass) { setError('Name, Username, and Password are required.'); return }
        if (pass !== pass2) { setError('Passwords do not match!'); return }
        
        try {
            await axios.post('/api/auth/register', {
                username: cred,
                password: pass,
                full_name: name,
                mobile: mobile
            })
            setInfo(`Account created for ${name}! Please sign in.`)
            setTimeout(() => {
                changeMode('login')
                setPass('')
                setPass2('')
            }, 2000)
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (Array.isArray(detail)) {
                setError(detail.map(d => d.msg).join(', '));
            } else if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError('Registration failed. (Is the backend server running?)');
            }
        }
    }

    const handleForgot = (e) => {
        e.preventDefault()
        if (!fpInput) { setError('Please enter your email or mobile.'); return }
        setInfo('Reset link sent! Check your email / SMS inbox.')
        setError('')
    }

    return (
        <div className="login-bg">
            <div className="login-card">
                {/* Brand */}
                <div className="login-brand">
                    {/* Exact Alamaticz Solutions logo image */}
                    <img
                        src={alamaticzLogo}
                        alt="Alamaticz Solutions"
                        style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 4 }}
                    />
                    <div className="login-title">Hire AI</div>
                    <div className="login-subtitle">
                        {mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Intelligent Recruitment'}
                    </div>
                </div>

                {/* Login Form */}
                {mode === 'login' && (
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input className="form-input" placeholder="Enter your username"
                                value={cred} onChange={e => setCred(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="password-input-container">
                                <input className="form-input" type={showPass ? "text" : "password"} placeholder="Enter your password"
                                    value={pass} onChange={e => setPass(e.target.value)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPass(!showPass)}>
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('forgot')}>
                                Forgot password?
                            </button>
                        </div>
                        <button type="submit" className="btn btn-primary btn-full">🔐 SIGN IN</button>
                        {error && <div className="form-error">{error}</div>}
                        <div className="login-footer" style={{ marginTop: '1.2rem' }}>
                            Don't have an account?{' '}
                            <button type="button" className="form-link" onClick={() => changeMode('register')}>
                                Create one
                            </button>
                        </div>
                    </form>
                )}

                {/* Register Form */}
                {mode === 'register' && (
                    <form onSubmit={handleRegister}>
                        <div className="form-group">
                            <label className="form-label">Full Name</label>
                            <input className="form-input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input className="form-input" placeholder="Choose a username" value={cred} onChange={e => setCred(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Mobile (optional)</label>
                            <input className="form-input" placeholder="+91 98765 43210" value={mobile} onChange={e => setMobile(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="password-input-container">
                                <input className="form-input" type={showRegisterPass ? "text" : "password"} placeholder="Create a strong password"
                                    value={pass} onChange={e => setPass(e.target.value)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowRegisterPass(!showRegisterPass)}>
                                    {showRegisterPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <div className="password-input-container">
                                <input className="form-input" type={showRegisterPass2 ? "text" : "password"} placeholder="Repeat password"
                                    value={pass2} onChange={e => setPass2(e.target.value)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowRegisterPass2(!showRegisterPass2)}>
                                    {showRegisterPass2 ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary btn-full">🚀 CREATE ACCOUNT</button>
                        {error && <div className="form-error">{error}</div>}
                        {info && <div className="form-success">{info}</div>}
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            Already have an account?{' '}
                            <button type="button" className="form-link" onClick={() => changeMode('login')}>
                                Sign in
                            </button>
                        </div>
                    </form>
                )}

                {/* Forgot Password */}
                {mode === 'forgot' && (
                    <form onSubmit={handleForgot}>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                            Enter your registered email or mobile number.
                        </p>
                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input className="form-input" placeholder="Enter your username"
                                value={fpInput} onChange={e => setFpInput(e.target.value)} />
                        </div>
                        <button type="submit" className="btn btn-primary btn-full">📨 SEND RESET LINK</button>
                        {error && <div className="form-error">{error}</div>}
                        {info && <div className="form-success">{info}</div>}
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('login')}>
                                ← Back to Sign In
                            </button>
                        </div>
                    </form>
                )}

                {/* Team Selection Form / Admin Portal Transitional Page */}
                {mode === 'team-selection' && (
                    <div>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                            Identify yourself to proceed into the Admin Portal
                        </p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
                            {['Boopathi', 'Praveen', 'Harish', 'Sabari'].map(member => {
                                const isSelected = selectedMember === member;
                                return (
                                    <div 
                                        key={member}
                                        onClick={() => setSelectedMember(member)}
                                        style={{
                                            background: isSelected ? 'rgba(251, 133, 0, 0.12)' : 'var(--input-bg)',
                                            border: isSelected ? '2px solid #FB8500' : '1.5px solid var(--border)',
                                            borderRadius: '12px',
                                            padding: '16px 10px',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            position: 'relative',
                                            boxShadow: isSelected ? '0 0 15px rgba(251, 133, 0, 0.25)' : 'none',
                                            transform: isSelected ? 'scale(1.03)' : 'none'
                                        }}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '50%',
                                            background: isSelected ? 'linear-gradient(135deg, #FB8500, #FFB703)' : 'rgba(255,255,255,0.08)',
                                            color: isSelected ? '#fff' : 'var(--text-dim)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            margin: '0 auto 8px',
                                            fontWeight: 'bold',
                                            fontSize: '1rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            {member[0]}
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.9rem', 
                                            fontWeight: isSelected ? 'bold' : '500',
                                            color: isSelected ? 'var(--gold)' : 'var(--text)'
                                        }}>
                                            {member}
                                        </span>
                                        {isSelected && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: '#FB8500',
                                                borderRadius: '50%',
                                                width: '18px',
                                                height: '18px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#fff'
                                            }}>
                                                <Check size={11} strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {selectedMember && (
                            <button 
                                onClick={handleEnterPortal}
                                style={{
                                    fontWeight: 'bold'
                                }}
                                className="btn btn-primary btn-full"
                            >
                                🚀 ENTER PORTAL AS {selectedMember.toUpperCase()}
                            </button>
                        )}
                        
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('login')}>
                                ← Back to Sign In
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                position: 'fixed', bottom: '1.2rem', left: 0, right: 0, textAlign: 'center',
                color: 'rgba(var(--sky-dim-rgb), 0.6)', fontSize: '0.77rem'
            }}>
                © 2025 Alamaticz Solutions · Innovation • Excellence • Reliability
            </div>
        </div>
    )
}
