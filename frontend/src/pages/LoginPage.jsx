import { useState } from 'react'
import { Eye, EyeOff, Check, LogIn, UserPlus, Send, KeyRound, ArrowLeft, Loader2 } from 'lucide-react'
import apiClient from '../api/client'
import alamaticzMark from '../assets/alamaticz-mark.png'
import { auth } from '../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'

function getFirebaseEmail(email, username) {
    if (!email) return '';
    const trimmed = email.trim();
    if (trimmed.includes('@')) {
        const parts = trimmed.split('@');
        const local = parts[0].split('+')[0]; // strip any existing subaddressing
        return `${local}+${username.trim().toLowerCase()}@${parts[1]}`;
    }
    return trimmed;
}

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
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [fieldErrors, setFieldErrors] = useState({})

    // Inline blur validation (S1.2) - lets people fix a password/confirm
    // mismatch before they hit submit, instead of only finding out after.
    const validateField = (key, value, compareValue) => {
        let msg = ''
        if (key === 'regPass' || key === 'fpPass') {
            if (value && value.length < 8) msg = 'Password must be at least 8 characters.'
        } else if (key === 'regPass2' || key === 'fpPass2') {
            if (value && value !== compareValue) msg = 'Passwords do not match.'
        }
        setFieldErrors(prev => ({ ...prev, [key]: msg }))
    }
    const clearFieldError = (key) => {
        if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }))
    }

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
        setIsSubmitting(false)
        setFieldErrors({})
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!cred || !pass) { setError('Please enter your Username and Password.'); return }
        if (isSubmitting) return

        const usernameLower = cred.trim().toLowerCase()
        setIsSubmitting(true)
        try {
            let resolvedEmail = '';
            try {
                const emailRes = await apiClient.get(`/api/auth/get-email?username=${encodeURIComponent(usernameLower)}`);
                resolvedEmail = emailRes.data.email;
            } catch (err) {
                resolvedEmail = usernameLower.includes('@') ? usernameLower : `${usernameLower}@hireai.local`;
            }

            let loginData = null;
            try {
                const userCredential = await signInWithEmailAndPassword(auth, resolvedEmail, pass)
                const fbUser = userCredential.user
                
                const res = await apiClient.post('/api/auth/firebase-sync', {
                    email: fbUser.email,
                    full_name: fbUser.displayName || cred,
                    username: usernameLower
                })
                loginData = res.data;
            } catch (fbErr) {
                if (fbErr.response?.status === 403) {
                    throw fbErr;
                }
                const res = await apiClient.post('/api/auth/login', {
                    username: usernameLower,
                    password: pass
                })
                loginData = res.data;
            }
            
            // "logged in to the portal" is now recorded server-side, inside
            // /api/auth/login and /api/auth/firebase-sync themselves - a
            // follow-up POST /api/activity from here always fired before
            // axios had the freshly-issued session token attached (that's
            // set by an effect that only runs after onLogin below causes a
            // re-render), so it 403'd against every login once that
            // endpoint started requiring an authenticated caller.
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
                setError('We couldn\'t sign you in. Please try again in a moment.');
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleRegister = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!name || !cred || !pass || !email) { setError('Name, Username, Email Address, and Password are required.'); return }
        if (pass !== pass2) { setError('Passwords do not match!'); return }
        if (pass.length < 8) { setError('Password must be at least 8 characters.'); return }
        if (isSubmitting) return

        setIsSubmitting(true)
        try {
            const usernameLower = cred.trim().toLowerCase();
            const registerEmail = email.trim();
            
            // 1. Check if username exists or email limit exceeded in SQLite first!
            const checkRes = await apiClient.get(`/api/auth/check-exists?username=${encodeURIComponent(usernameLower)}&email=${encodeURIComponent(registerEmail)}`);
            if (checkRes.data.exists) {
                setError(checkRes.data.reason || 'Username or email already in use.');
                return;
            }
            
            // 2. Generate unique Firebase email (Gmail subaddressing support)
            const firebaseEmail = getFirebaseEmail(email, cred);
            
            try {
                await createUserWithEmailAndPassword(auth, firebaseEmail, pass);
            } catch (fbErr) {
                if (fbErr.code === 'auth/email-already-in-use') {
                    // This is the case where they were deleted from SQLite but still exist in Firebase Auth.
                    // We can just proceed to sync them!
                } else {
                    throw fbErr;
                }
            }
            
            try {
                await apiClient.post('/api/auth/firebase-sync', {
                    email: firebaseEmail,
                    full_name: name,
                    username: usernameLower,
                    mobile: mobile.trim()
                });
            } catch (syncErr) {
                if (syncErr.response?.status === 403) {
                    changeMode('login');
                    setInfo('Registration request sent! Please wait for admin approval before signing in.');
                    setPass(''); setPass2('');
                    return;
                }
                throw syncErr;
            }

            changeMode('login');
            setInfo(`Account created for ${name}! Please sign in.`);
            setPass(''); setPass2('');
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
                setError('Password is too weak. Use at least 8 characters.');
            } else {
                setError('We couldn\'t complete your registration. Please try again in a moment.');
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleForgotRequest = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!mobile) { setError('Please enter your registered Mobile Number.'); return }
        if (isSubmitting) return

        setIsSubmitting(true)
        try {
            const res = await apiClient.post('/api/auth/forgot-password/request', { mobile: mobile.trim() })
            setInfo(res.data.message)
            // Dev-only: the backend can return the OTP directly in non-production setups
            // where no SMS/email delivery is configured. Never show this in a real build.
            if (import.meta.env.DEV && res.data.otp) {
                setSimulatedOtp(res.data.otp)
            } else {
                setSimulatedOtp('')
            }
            setForgotStep(2)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to request password reset OTP.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleForgotReset = async (e) => {
        e.preventDefault()
        setError(''); setInfo('')
        if (!fpOtp || !fpNewPass || !fpNewPass2) { setError('All fields are required.'); return }
        if (fpNewPass !== fpNewPass2) { setError('Passwords do not match!'); return }
        if (fpNewPass.length < 8) { setError('Password must be at least 8 characters.'); return }
        if (isSubmitting) return

        setIsSubmitting(true)
        try {
            const res = await apiClient.post('/api/auth/forgot-password/reset', {
                mobile: mobile.trim(),
                otp: fpOtp.trim(),
                new_password: fpNewPass
            })
            changeMode('login')
            setInfo(res.data.message)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to reset password. Please check your OTP.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="login-bg">
            <div className="login-card">
                {/* Brand */}
                <div className="login-brand">
                    <img
                        src={alamaticzMark}
                        alt="Alamaticz Solutions"
                        style={{ width: 76, height: 76, objectFit: 'contain', marginBottom: 4 }}
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
                            <label className="form-label" htmlFor="login-username">Username</label>
                            <input id="login-username" className="form-input" placeholder="Enter your username"
                                autoComplete="username" autoFocus
                                value={cred} onChange={e => setCred(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="login-password">Password</label>
                            <div className="password-input-container">
                                <input id="login-password" className="form-input" type={showPass ? "text" : "password"} placeholder="Enter your password"
                                    autoComplete="current-password"
                                    value={pass} onChange={e => setPass(e.target.value)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('forgot')}>
                                Forgot password?
                            </button>
                        </div>
                        <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
                            {isSubmitting ? 'Signing in…' : 'Sign in'}
                        </button>
                        {error && <div className="form-error" role="alert">{error}</div>}
                        {info && <div className="form-success" role="status">{info}</div>}
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
                            <label className="form-label" htmlFor="reg-name">Full Name</label>
                            <input id="reg-name" className="form-input" placeholder="John Doe" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reg-username">Username</label>
                            <input id="reg-username" className="form-input" placeholder="Choose a username" autoComplete="username" value={cred} onChange={e => setCred(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reg-mobile">Mobile (optional)</label>
                            <input id="reg-mobile" className="form-input" type="tel" placeholder="+91 98765 43210" autoComplete="tel" value={mobile} onChange={e => setMobile(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reg-email">Email Address *</label>
                            <input id="reg-email" className="form-input" type="email" placeholder="john@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reg-password">Password</label>
                            <div className="password-input-container">
                                <input id="reg-password" className="form-input" type={showRegisterPass ? "text" : "password"} placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    aria-invalid={!!fieldErrors.regPass} aria-describedby={fieldErrors.regPass ? 'reg-password-error' : undefined}
                                    value={pass} onChange={e => { setPass(e.target.value); clearFieldError('regPass') }}
                                    onBlur={e => validateField('regPass', e.target.value)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowRegisterPass(!showRegisterPass)} aria-label={showRegisterPass ? 'Hide password' : 'Show password'}>
                                    {showRegisterPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {fieldErrors.regPass && <div id="reg-password-error" className="form-error" style={{ marginTop: 4 }} role="alert">{fieldErrors.regPass}</div>}
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reg-password2">Confirm Password</label>
                            <div className="password-input-container">
                                <input id="reg-password2" className="form-input" type={showRegisterPass2 ? "text" : "password"} placeholder="Repeat password"
                                    autoComplete="new-password"
                                    aria-invalid={!!fieldErrors.regPass2} aria-describedby={fieldErrors.regPass2 ? 'reg-password2-error' : undefined}
                                    value={pass2} onChange={e => { setPass2(e.target.value); clearFieldError('regPass2') }}
                                    onBlur={e => validateField('regPass2', e.target.value, pass)} />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowRegisterPass2(!showRegisterPass2)} aria-label={showRegisterPass2 ? 'Hide password' : 'Show password'}>
                                    {showRegisterPass2 ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {fieldErrors.regPass2 && <div id="reg-password2-error" className="form-error" style={{ marginTop: 4 }} role="alert">{fieldErrors.regPass2}</div>}
                        </div>
                        <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
                            {isSubmitting ? 'Creating account…' : 'Create account'}
                        </button>
                        {error && <div className="form-error" role="alert">{error}</div>}
                        {info && <div className="form-success" role="status">{info}</div>}
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
                                    Enter your registered Mobile Number. We will send you a 6-digit OTP code to reset your password.
                                </p>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="fp-mobile">Mobile Number</label>
                                    <input id="fp-mobile" className="form-input" type="tel" placeholder="Enter your mobile number" autoComplete="tel"
                                        value={mobile} onChange={e => setMobile(e.target.value)} required />
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                    {isSubmitting ? 'Sending…' : 'Request reset OTP'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleForgotReset}>
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                                    We sent an OTP to <strong>{mobile}</strong>. Please enter the OTP and create your new password below.
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
                                        [Dev Mode] OTP Code: {simulatedOtp}
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="form-label" htmlFor="fp-otp">6-Digit OTP Code</label>
                                    <input id="fp-otp" className="form-input" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="Enter 6-digit OTP" maxLength={6}
                                        value={fpOtp} onChange={e => setFpOtp(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="fp-newpass">New Password</label>
                                    <input id="fp-newpass" className="form-input" type="password" placeholder="At least 8 characters" autoComplete="new-password"
                                        aria-invalid={!!fieldErrors.fpPass} aria-describedby={fieldErrors.fpPass ? 'fp-newpass-error' : undefined}
                                        value={fpNewPass} onChange={e => { setFpNewPass(e.target.value); clearFieldError('fpPass') }}
                                        onBlur={e => validateField('fpPass', e.target.value)} required />
                                    {fieldErrors.fpPass && <div id="fp-newpass-error" className="form-error" style={{ marginTop: 4 }} role="alert">{fieldErrors.fpPass}</div>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="fp-newpass2">Confirm New Password</label>
                                    <input id="fp-newpass2" className="form-input" type="password" placeholder="Repeat new password" autoComplete="new-password"
                                        aria-invalid={!!fieldErrors.fpPass2} aria-describedby={fieldErrors.fpPass2 ? 'fp-newpass2-error' : undefined}
                                        value={fpNewPass2} onChange={e => { setFpNewPass2(e.target.value); clearFieldError('fpPass2') }}
                                        onBlur={e => validateField('fpPass2', e.target.value, fpNewPass)} required />
                                    {fieldErrors.fpPass2 && <div id="fp-newpass2-error" className="form-error" style={{ marginTop: 4 }} role="alert">{fieldErrors.fpPass2}</div>}
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
                                    {isSubmitting ? 'Resetting…' : 'Reset password'}
                                </button>
                            </form>
                        )}
                        {error && <div className="form-error" style={{ marginTop: '1rem' }} role="alert">{error}</div>}
                        {info && <div className="form-success" style={{ marginTop: '1rem' }} role="status">{info}</div>}
                        <div className="login-footer" style={{ marginTop: '1rem' }}>
                            <button type="button" className="form-link" onClick={() => changeMode('login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <ArrowLeft size={14} /> Back to sign in
                            </button>
                        </div>
                    </div>
                )}

                {/* Team selection is now handled inside the Admin Portal */}
            </div>

            {/* Footer */}
            <div style={{
                position: 'fixed', bottom: '1.2rem', left: 0, right: 0, textAlign: 'center',
                color: 'var(--text-subtle)', fontSize: '0.77rem'
            }}>
                © {new Date().getFullYear()} Alamaticz Solutions · Innovation · Excellence · Reliability
            </div>
        </div>
    )
}
