'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useAuthStore } from '@/lib/store';
import { authAPI } from '@/lib/api';
import { loadFaceModels, getFaceDescriptor, descriptorToArray } from '@/lib/faceAuth';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const { setAuth } = useAuthStore();
    const { data: session, status } = useSession();
    const [googleLoading, setGoogleLoading] = useState(false);
    const [tab, setTab] = useState<'password' | 'face'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [faceLoading, setFaceLoading] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const retryFnRef = useRef<(() => void) | null>(null);

    // ── Handle Google sign-in redirect ────────────────────────────────────────
    useEffect(() => {
        if (status === 'authenticated' && session) {
            const customToken = (session as any).customToken;
            const customUser = (session as any).customUser;
            if (customToken && customUser) {
                setAuth(customUser, customToken);
                toast.success('Welcome, ' + customUser.username + '!');
                router.push('/dashboard');
            }
        }
    }, [status, session, setAuth, router]);

    // ── Google login handler ──────────────────────────────────────────────────
    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        try {
            await signIn('google', { callbackUrl: '/auth/login' });
        } catch {
            toast.error('Google sign-in failed');
            setGoogleLoading(false);
        }
    };

    // Re-attach stream every render (fixes AnimatePresence black screen)
    useEffect(() => {
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    });

    // ── Password login ────────────────────────────────────────────────────────
    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await authAPI.login({ email, password });
            setAuth(res.data.user, res.data.token);
            toast.success('Welcome back, ' + res.data.user.username + '!');
            router.push('/dashboard');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            toast.error(error.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    // ── Wait for video to be playing before running face detection ────────────
    const waitForVideo = (video: HTMLVideoElement): Promise<void> =>
        new Promise((resolve) => {
            if (video.readyState >= 2 && !video.paused) { resolve(); return; }
            const onReady = () => { video.removeEventListener('playing', onReady); resolve(); };
            video.addEventListener('playing', onReady);
            // Fallback timeout so we never hang forever
            setTimeout(resolve, 3000);
        });

    // ── Face scan (defined with useCallback BEFORE the auto-scan useEffect) ──
    const handleFaceLogin = useCallback(async () => {
        if (!videoRef.current || !modelsReady) return;
        setFaceLoading(true);

        try {
            // Wait until the camera feed is actually streaming frames
            await waitForVideo(videoRef.current);

            const MAX_ATTEMPTS = 6;
            let descriptor: Float32Array | null = null;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                setStatusMsg(`Detecting face… (${attempt}/${MAX_ATTEMPTS})`);
                // Small delay to let the video buffer a fresh frame
                await new Promise((r) => setTimeout(r, 400));
                if (!videoRef.current) break;
                descriptor = await getFaceDescriptor(videoRef.current);
                if (descriptor) break;
            }

            if (!descriptor) {
                setStatusMsg('');
                toast.error('No face detected. Make sure your face is well-lit and looking at the camera, then click Retry.');
                return;
            }

            setStatusMsg('Authenticating…');
            const res = await authAPI.faceLogin({
                faceDescriptor: descriptorToArray(descriptor),
                email: email || undefined,
            });
            setAuth(res.data.user, res.data.token);
            toast.success('Face authentication successful!');
            router.push('/dashboard');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            const msg = error.response?.data?.error || 'Face not recognized';
            toast.error(msg);
            setStatusMsg('');
        } finally {
            setFaceLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelsReady, email]);

    // ── Auto-scan as soon as models + camera are ready ────────────────────────
    // (handleFaceLogin is now declared ABOVE this, so it is not undefined)
    useEffect(() => {
        if (modelsReady && !faceLoading) {
            handleFaceLogin();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelsReady]);

    // ── Face tab: open camera and load models ─────────────────────────────────
    useEffect(() => {
        if (tab !== 'face') {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraReady(false);
            setModelsReady(false);
            setStatusMsg('');
            setErrorMsg('');
            return;
        }

        let cancelled = false;
        let retries = 0;

        const startCamera = async () => {
            if (cancelled) return;
            setErrorMsg('');

            // mediaDevices is undefined on plain HTTP (non-localhost) — requires HTTPS
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                setErrorMsg('⚠️ Camera requires a secure connection (HTTPS). Please access this site using https:// instead of http://');
                return;
            }

            try {
                setStatusMsg('Checking camera…');
                const devices = await navigator.mediaDevices.enumerateDevices();
                const hasVideo = devices.some((d) => d.kind === 'videoinput');
                if (!hasVideo) { setErrorMsg('No camera detected. Please connect a webcam.'); return; }

                setStatusMsg('Opening camera…');
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
                setCameraReady(true);

                setStatusMsg('Loading AI face models…');
                await loadFaceModels();
                if (cancelled) return;

                setModelsReady(true);
                setStatusMsg('');
            } catch (err: unknown) {
                if (cancelled) return;
                const e = err as DOMException;
                let msg = '';
                if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
                    if (retries === 0) { retries++; setTimeout(() => startCamera(), 1200); setStatusMsg('Camera busy — retrying…'); return; }
                    msg = '⚠️ Camera is in use by another app. Close it then click Retry.';
                } else if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                    msg = '⚠️ Camera permission denied. Click the 🔒 icon in the address bar → allow camera → Retry.';
                } else if (e.name === 'NotFoundError') {
                    msg = '⚠️ No webcam found on this device.';
                } else {
                    msg = '⚠️ Camera error: ' + (e.message || e.name);
                }
                setErrorMsg(msg);
                setStatusMsg('');
            }
        };

        retryFnRef.current = startCamera;
        const timer = setTimeout(startCamera, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraReady(false);
            setModelsReady(false);
            setErrorMsg('');
        };
    }, [tab]);

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '2rem',
            paddingTop: 'calc(var(--nav-height) + 2rem)',
            position: 'relative', zIndex: 1,
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="glass-strong"
                style={{ width: '100%', maxWidth: 440, padding: '2.5rem' }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem', boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
                        fontSize: '1.5rem',
                    }}>🔐</div>
                    <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Welcome back
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Sign in to your AuthentiCam account
                    </p>
                </div>

                {/* Google Login */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.625rem', padding: '0.65rem 1rem',
                        border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 'var(--radius-lg)',
                        background: 'white', cursor: googleLoading ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
                        color: '#3c4043', transition: 'box-shadow 0.2s, opacity 0.2s',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        opacity: googleLoading ? 0.7 : 1,
                        marginBottom: '1.25rem',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)')}
                >
                    {googleLoading ? (
                        <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#4285F4' }} />
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                        </svg>
                    )}
                    {googleLoading ? 'Redirecting…' : 'Continue with Google'}
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>or sign in with</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.05)',
                    borderRadius: 'var(--radius-full)', padding: '4px', marginBottom: '1.5rem',
                }}>
                    {(['password', 'face'] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            flex: 1, padding: '0.5rem', border: 'none', borderRadius: 'var(--radius-full)',
                            fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            background: tab === t ? 'white' : 'transparent',
                            color: tab === t ? 'var(--primary)' : 'var(--text-secondary)',
                            boxShadow: tab === t ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.2s',
                        }}>
                            {t === 'password' ? '🔑 Password' : '👤 Face ID'}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {tab === 'password' ? (
                        <motion.form
                            key="password"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.15 }}
                            onSubmit={handlePasswordLogin}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            <div>
                                <label>Email</label>
                                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div>
                                <label>Password</label>
                                <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                                {loading ? <span className="spinner" /> : 'Sign In'}
                            </button>
                        </motion.form>
                    ) : (
                        <motion.div
                            key="face"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}
                        >
                            <div style={{ width: '100%' }}>
                                <label>Email (optional — helps find your account faster)</label>
                                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>

                            {/* Camera */}
                            <div style={{
                                width: 280, height: 210, borderRadius: 'var(--radius-lg)',
                                overflow: 'hidden', background: '#000', position: 'relative',
                                border: `2px solid ${errorMsg ? '#ef4444' : modelsReady ? 'var(--success)' : 'var(--primary)'}`,
                                flexShrink: 0,
                            }}>
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

                                {/* Initialising overlay */}
                                {!cameraReady && !errorMsg && (
                                    <div style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', gap: '0.5rem',
                                    }}>
                                        <span style={{ fontSize: '2rem' }}>📷</span>
                                        <span style={{ fontSize: '0.8rem' }}>{statusMsg || 'Initialising…'}</span>
                                    </div>
                                )}

                                {/* Error overlay */}
                                {errorMsg && (
                                    <div style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '1rem', gap: '0.75rem',
                                    }}>
                                        <span style={{ fontSize: '1.5rem' }}>❌</span>
                                        <p style={{ color: '#fca5a5', fontSize: '0.75rem', textAlign: 'center', lineHeight: 1.5 }}>{errorMsg}</p>
                                        <button
                                            onClick={() => retryFnRef.current?.()}
                                            style={{ background: 'white', color: '#1e1e2e', fontSize: '0.78rem', padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            🔄 Retry Camera
                                        </button>
                                    </div>
                                )}

                                {/* Scanning overlay */}
                                {faceLoading && (
                                    <div style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    }}>
                                        <div className="spinner" style={{ width: 28, height: 28, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
                                        <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 600 }}>{statusMsg || 'Scanning…'}</span>
                                    </div>
                                )}

                                {/* Corner brackets */}
                                {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                                    <div key={c} style={{
                                        position: 'absolute', width: 20, height: 20,
                                        borderColor: errorMsg ? '#ef4444' : modelsReady ? 'var(--success)' : 'var(--primary)',
                                        borderStyle: 'solid', borderWidth: 0,
                                        ...(c === 'tl' ? { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3 } : {}),
                                        ...(c === 'tr' ? { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3 } : {}),
                                        ...(c === 'bl' ? { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3 } : {}),
                                        ...(c === 'br' ? { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3 } : {}),
                                    }} />
                                ))}
                            </div>

                            {/* Status text */}
                            {!errorMsg && (
                                <p style={{ fontSize: '0.78rem', fontWeight: 500, textAlign: 'center', color: 'var(--text-secondary)', minHeight: '1.2em' }}>
                                    {faceLoading
                                        ? statusMsg
                                        : modelsReady
                                            ? '✅ AI ready — you can retry if scan failed'
                                            : statusMsg || '⏳ Waiting for camera…'}
                                </p>
                            )}

                            {/* Retry button (manual fallback) */}
                            <button
                                className="btn btn-primary"
                                onClick={handleFaceLogin}
                                disabled={faceLoading || !modelsReady || !!errorMsg}
                                style={{ width: '100%', justifyContent: 'center' }}
                            >
                                {faceLoading
                                    ? <><span className="spinner" /> Scanning…</>
                                    : modelsReady
                                        ? '🔄 Retry Face Scan'
                                        : 'Waiting for camera…'}
                            </button>

                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                                Face ID only works if you enrolled your face during registration. If you skipped that step, use Password login instead.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1.5rem' }}>
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/register" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                        Sign up free
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
