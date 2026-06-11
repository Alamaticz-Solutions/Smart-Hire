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

    const [email, setEmail] = useState('')
    const [forgotStep, setForgotStep] = useState(1) // 1: request OTP, 2: reset
    const [fpOtp, setFpOtp] = useState('')
    const [fpNewPass, setFpNewPass] = useState('')
    const [fpNewPass2, setFpNewPass2] = useState('')
    const [simulatedOtp, setSimulatedOtp] = useState('')

    const changeMode = (newMode) => {
        setMode(newMode)
        setError('')
        setInfo('')
        setShowPass(false)
        setShowRegisterPass(false)
        setShowRegisterPass2(false)
        setSelectedMember(null)
        setEmail('')
        setForgotStep(1)
        setFpOtp('')
        setFpNewPass('')
        setFpNewPass2('')
        setSimulatedOtp('')
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!cred || !pass) { setError('Please enter your Username and Password.'); return }
        
        const usernameLower = cred.trim().toLowerCase()
        try {
            let resolvedEmail = '';
            try {
                const emailRes = await axios.get(`/api/auth/get-email?username=${encodeURIComponent(usernameLower)}`);
                resolvedEmail = emailRes.data.email;
            } catch (err) {
                resolvedEmail = usernameLower.includes('@') ? usernameLower : `${usernameLower}@hireai.local`;
            }

            let loginData = null;
            try {
                const userCredential = await signInWithEmailAndPassword(auth, resolvedEmail, pass)
                const fbUser = userCredential.user
                
                const res = await axios.post('/api/auth/firebase-sync', {
                    email: fbUser.email,
                    full_name: fbUser.displayName || cred,
                    username: usernameLower
                })
                loginData = res.data;
            } catch (fbErr) {
                console.log("Firebase auth failed, trying SQLite fallback...", fbErr);
                const res = await axios.post('/api/auth/login', {
                    username: usernameLower,
                    password: pass
                })
                loginData = res.data;
            }
            
            try {
                await axios.post('/api/activity', { 
                    username: loginData.username, 
                    action: 'logged in to the portal' 
                })
            } catch (err) {
                console.error("Failed to log activity", err);
            }

            onLogin(loginData)
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
        if (!name || !cred || !pass || !email) { setError('Name, Username, Email Address, and Password are required.'); return }
        if (pass !== pass2) { setError('Passwords do not match!'); return }
        
        try {
            const registerEmail = email.trim()
            await createUserWithEmailAndPassword(auth, registerEmail, pass)
            
            await axios.post('/api/auth/firebase-sync', {
                email: registerEmail,
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

    const handleForgotRequest = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!email) { setError('Please enter your registered Email Address.'); return }
        
        try {
            const res = await axios.post('/api/auth/forgot-password/request', { email: email.trim() })
            setInfo(res.data.message)
            if (res.data.otp) {
                setSimulatedOtp(res.data.otp)
            } else {
                setSimulatedOtp('')
            }
            setForgotStep(2)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to request password reset OTP.')
        }
    }

    const handleForgotReset = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!fpOtp || !fpNewPass || !fpNewPass2) { setError('All fields are required.'); return }
        if (fpNewPass !== fpNewPass2) { setError('Passwords do not match!'); return }
        
        try {
            const res = await axios.post('/api/auth/forgot-password/reset', {
                email: email.trim(),
                otp: fpOtp.trim(),
                new_password: fpNewPass
            })
            setInfo(res.data.message)
            setSimulatedOtp('')
            setTimeout(() => {
                changeMode('login')
            }, 2500)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to reset password. Please check your OTP.')
        }
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
                            <label className="form-label">Email Address *</label>
                            <input className="form-input" type="email" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
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
                    <div style={{ width: '100%' }}>
                        {forgotStep === 1 ? (
                            <form onSubmit={handleForgotRequest}>
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                                    Enter your registered Gmail address. We will send you a 6-digit OTP code to reset your password.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Gmail Address</label>
                                    <input className="form-input" type="email" placeholder="enter your gmail address"
                                        value={email} onChange={e => setEmail(e.target.value)} required />
                                </div>
                                <button type="submit" className="btn btn-primary btn-full">📨 REQUEST RESET OTP</button>
                            </form>
                        ) : (
                            <form onSubmit={handleForgotReset}>
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                                    We sent an OTP to <strong>{email}</strong>. Please enter the OTP and create your new password below.
                                </p>
                                {simulatedOtp && (
                                    <div style={{
                                        background: 'rgba(var(--gold-rgb), 0.12)',
                                        border: '1px dashed var(--gold)',
                                        borderRadius: 6,
                                        padding: '10px 12px',
                                        fontSize: '0.82rem',
                                        color: 'var(--gold)',
                                        marginBottom: '1rem',
                                        textAlign: 'center',
                                        fontWeight: 'bold'
                                    }}>
                                        🔔 [Demo Mode] OTP Code: {simulatedOtp}
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="form-label">6-Digit OTP Code</label>
                                    <input className="form-input" type="text" placeholder="Enter 6-digit OTP" maxLength={6}
                                        value={fpOtp} onChange={e => setFpOtp(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">New Password</label>
                                    <input className="form-input" type="password" placeholder="Enter new password"
                                        value={fpNewPass} onChange={e => setFpNewPass(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Confirm New Password</label>
                                    <input className="form-input" type="password" placeholder="Repeat new password"
                                        value={fpNewPass2} onChange={e => setFpNewPass2(e.target.value)} required />
                                </div>
                                <button type="submit" className="btn btn-primary btn-full">🔐 RESET PASSWORD</button>
                            </form>
                        )}
                        {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}
                        {info && <div className="form-success" style={{ marginTop: '1rem' }}>{info}</div>}
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('login')}>
                                ← Back to Sign In
                            </button>
                        </div>
                    </div>
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
