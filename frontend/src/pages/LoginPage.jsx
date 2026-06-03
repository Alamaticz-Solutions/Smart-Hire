import { useState } from 'react'
import axios from 'axios'
import { Eye, EyeOff, Check } from 'lucide-react'
import alamaticzLogo from '../assets/alamaticz-logo.jpg'
import { auth } from '../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'

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
            const email = cred.includes('@') ? cred : `${cred.trim().toLowerCase()}@hireai.local`
            const userCredential = await signInWithEmailAndPassword(auth, email, pass)
            const fbUser = userCredential.user
            
            const res = await axios.post('/api/auth/firebase-sync', {
                email: fbUser.email,
                full_name: fbUser.displayName || cred,
                username: cred.trim().toLowerCase()
            })
            
            try {
                await axios.post('/api/activity', { 
                    username: res.data.username, 
                    action: 'logged in to the portal' 
                })
            } catch (err) {
                console.error("Failed to log activity", err);
            }

            onLogin(res.data)
        } catch (err) {
            console.error("Login error:", err);
            const detail = err.response?.data?.detail;
            if (detail) {
                if (Array.isArray(detail)) {
                    setError(detail.map(d => d.msg).join(', '));
                } else if (typeof detail === 'string') {
                    setError(detail);
                }
            } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Invalid username or password.');
            } else {
                setError(err.message || 'Login failed. (Is the backend server running?)');
            }
        }
    }

    const handleRegister = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!name || !cred || !pass) { setError('Name, Username, and Password are required.'); return }
        if (pass !== pass2) { setError('Passwords do not match!'); return }
        
        try {
            const email = cred.includes('@') ? cred : `${cred.trim().toLowerCase()}@hireai.local`
            await createUserWithEmailAndPassword(auth, email, pass)
            
            await axios.post('/api/auth/firebase-sync', {
                email: email,
                full_name: name,
                username: cred.trim().toLowerCase()
            })
            
            setInfo(`Account created for ${name}! Please sign in.`)
            setTimeout(() => {
                changeMode('login')
                setPass('')
                setPass2('')
            }, 2000)
        } catch (err) {
            console.error("Register error:", err);
            const detail = err.response?.data?.detail;
            if (detail) {
                if (Array.isArray(detail)) {
                    setError(detail.map(d => d.msg).join(', '));
                } else if (typeof detail === 'string') {
                    setError(detail);
                }
            } else if (err.code === 'auth/email-already-in-use') {
                setError('Username or email already in use.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. (Must be at least 6 characters)');
            } else {
                setError(err.message || 'Registration failed. (Is the backend server running?)');
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

                {/* Team selection is now handled inside the Admin Portal */}
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
