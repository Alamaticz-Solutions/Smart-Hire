import { useState } from 'react'
import axios from 'axios'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'

export default function LoginPage({ onLogin }) {
    const [mode, setMode] = useState('login')   // login | register | forgot
    const [cred, setCred] = useState('')
    const [pass, setPass] = useState('')
    const [name, setName] = useState('')
    const [pass2, setPass2] = useState('')
    const [mobile, setMobile] = useState('')
    const [fpInput, setFpInput] = useState('')
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    const handleLogin = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!cred || !pass) { setError('Please enter your Username and Password.'); return }
        
        try {
            const res = await axios.post('/api/auth/login', { username: cred, password: pass })
            onLogin(res.data)
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
            setTimeout(() => { setMode('login'); setInfo(''); setPass(''); setPass2(''); }, 2000)
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
                            <input className="form-input" type="password" placeholder="Enter your password"
                                value={pass} onChange={e => setPass(e.target.value)} />
                        </div>
                        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => { setMode('forgot'); setError(''); setInfo('') }}>
                                Forgot password?
                            </button>
                        </div>
                        <button type="submit" className="btn btn-primary btn-full">🔐 SIGN IN</button>
                        {error && <div className="form-error">{error}</div>}
                        <div className="login-footer" style={{ marginTop: '1.2rem' }}>
                            Don't have an account?{' '}
                            <button type="button" className="form-link" onClick={() => { setMode('register'); setError(''); setInfo('') }}>
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
                            <input className="form-input" type="password" placeholder="Create a strong password"
                                value={pass} onChange={e => setPass(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <input className="form-input" type="password" placeholder="Repeat password"
                                value={pass2} onChange={e => setPass2(e.target.value)} />
                        </div>
                        <button type="submit" className="btn btn-primary btn-full">🚀 CREATE ACCOUNT</button>
                        {error && <div className="form-error">{error}</div>}
                        {info && <div className="form-success">{info}</div>}
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            Already have an account?{' '}
                            <button type="button" className="form-link" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
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
                            <button type="button" className="form-link" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
                                ← Back to Sign In
                            </button>
                        </div>
                    </form>
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
