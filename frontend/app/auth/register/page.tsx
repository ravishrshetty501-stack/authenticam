'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authAPI } from '@/lib/api';
import {
    loadFaceModels,
    captureAveragedDescriptor,
    descriptorToArray,
} from '@/lib/faceAuth';
import toast from 'react-hot-toast';
import Link from 'next/link';

const STEPS = ['Account', 'Face ID (Optional)', 'Done'];

export default function RegisterPage() {
    const router = useRouter();
    const { setAuth } = useAuthStore();
    const [step, setStep] = useState(0);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [faceStatus, setFaceStatus] = useState('');
    const [captureProgress, setCaptureProgress] = useState(0);
    const [loading, setLoading] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Re-attach stream to video after every render (fixes AnimatePresence black screen)
    useEffect(() => {
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    });

    // Camera lifecycle tied to step 1
    useEffect(() => {
        if (step !== 1) {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraActive(false);
            setModelsReady(false);
            setFaceStatus('');
            setCaptureProgress(0);
            return;
        }

        let cancelled = false;
        const init = async () => {
            await new Promise((r) => setTimeout(r, 250));
            if (cancelled) return;
            try {
                setFaceStatus('Starting camera…');
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,   // use the laptop's built-in front camera (default)
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
                setCameraActive(true);
                setFaceStatus('Loading AI models…');
                await loadFaceModels();
                if (cancelled) return;
                setModelsReady(true);
                setFaceStatus('Look at the camera, then click Capture Face');
            } catch (err: unknown) {
                const error = err as Error;
                toast.error('Camera error: ' + error.message);
                setFaceStatus('Camera unavailable');
            }
        };
        init();
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraActive(false);
        };
    }, [step]);

    const handleAccountStep = (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
        if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
        setStep(1);
    };

    const captureFace = async () => {
        if (!videoRef.current || !modelsReady) return;
        setCaptureProgress(0);
        setFaceStatus('Capturing face — hold still…');
        try {
            const descriptor = await captureAveragedDescriptor(
                videoRef.current,
                5,
                (n) => setCaptureProgress(n)
            );
            if (!descriptor) {
                toast.error('No face detected. Make sure your face is clearly visible.');
                setFaceStatus('No face detected — try again');
                return;
            }
            setFaceDescriptor(descriptorToArray(descriptor));
            setFaceStatus('✅ Face enrolled!');
            toast.success('Face enrolled successfully!');
        } catch {
            toast.error('Face capture failed');
        }
    };

    const handleRegister = async () => {
        setLoading(true);
        try {
            const res = await authAPI.register({
                username, email, password,
                faceDescriptor: faceDescriptor || undefined,
            });
            setAuth(res.data.user, res.data.token);
            setStep(2);
            setTimeout(() => router.push('/dashboard'), 2000);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            toast.error(error.response?.data?.error || 'Registration failed');
            setStep(0);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem', paddingTop: 'calc(var(--nav-height) + 2rem)',
            position: 'relative', zIndex: 1,
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="glass-strong"
                style={{ width: '100%', maxWidth: 480, padding: '2.5rem' }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem', boxShadow: '0 8px 24px rgba(79,70,229,0.35)', fontSize: '1.5rem',
                    }}>🛡️</div>
                    <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Create your account
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Start authenticating your media today
                    </p>
                </div>

                {/* Step indicators */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '2rem' }}>
                    {STEPS.map((s, i) => (
                        <div key={s} style={{ flex: 1 }}>
                            <div style={{
                                height: 4, borderRadius: 4,
                                background: i <= step ? 'var(--primary)' : 'rgba(0,0,0,0.08)',
                                transition: 'background 0.3s',
                            }} />
                            <div style={{ fontSize: '0.7rem', color: i <= step ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, marginTop: '4px' }}>
                                {s}
                            </div>
                        </div>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.form key="step0"
                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            onSubmit={handleAccountStep}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            <div>
                                <label>Username</label>
                                <input className="input" placeholder="johndoe" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
                            </div>
                            <div>
                                <label>Email</label>
                                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div>
                                <label>Password</label>
                                <input className="input" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                            </div>
                            <div>
                                <label>Confirm Password</label>
                                <input className="input" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                                Continue →
                            </button>
                        </motion.form>
                    )}

                    {step === 1 && (
                        <motion.div key="step1"
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.15 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}
                        >
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
                                Set up Face ID for biometric login. Your face is stored as an encrypted 128-dim vector — <strong>never as an image</strong>.
                            </p>

                            {/* Camera */}
                            <div style={{
                                width: 260, height: 195, borderRadius: 'var(--radius-lg)',
                                overflow: 'hidden', background: '#000', position: 'relative',
                                border: `2px solid ${faceDescriptor ? 'var(--success)' : modelsReady ? 'var(--primary)' : 'rgba(100,100,100,0.3)'}`,
                            }}>
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

                                {!cameraActive && (
                                    <div style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white',
                                    }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                                        <span style={{ fontSize: '0.8rem' }}>Starting camera…</span>
                                    </div>
                                )}

                                {faceDescriptor && (
                                    <div style={{
                                        position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <div style={{
                                            background: 'rgba(0,0,0,0.7)', borderRadius: 12, padding: '8px 16px',
                                            color: 'white', fontWeight: 700, fontSize: '0.85rem',
                                        }}>
                                            ✅ Face Enrolled
                                        </div>
                                    </div>
                                )}

                                {/* Progress bar during capture */}
                                {captureProgress > 0 && captureProgress < 5 && (
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.15)' }}>
                                        <div style={{ width: `${(captureProgress / 5) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
                                    </div>
                                )}
                            </div>

                            {/* Face status */}
                            {faceStatus && (
                                <div style={{ fontSize: '0.8rem', color: faceDescriptor ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>
                                    {faceStatus}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button className="btn btn-secondary" onClick={captureFace} disabled={!modelsReady || !!faceDescriptor} style={{ flex: 1, justifyContent: 'center' }}>
                                    {modelsReady ? '📸 Capture Face' : 'Loading AI…'}
                                </button>
                                {faceDescriptor && (
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setFaceDescriptor(null); setFaceStatus('Look at the camera, then click Capture Face'); setCaptureProgress(0); }}>
                                        Redo
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setFaceDescriptor(null); handleRegister(); }} style={{ flex: 1, justifyContent: 'center' }}>
                                    Skip for now
                                </button>
                                <button className="btn btn-primary" onClick={handleRegister} disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
                                    {loading ? <span className="spinner" /> : faceDescriptor ? '🎉 Create Account with Face ID' : 'Create Account'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="step2"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}
                        >
                            <div style={{ fontSize: '3rem' }}>🎉</div>
                            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.3rem' }}>Account Created!</h3>
                            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.875rem' }}>
                                {faceDescriptor ? 'Face ID enrolled. ' : ''}Redirecting to your dashboard…
                            </p>
                            <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {step === 0 && (
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1.5rem' }}>
                        Already have an account?{' '}
                        <Link href="/auth/login" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
                    </p>
                )}
            </motion.div>
        </div>
    );
}
