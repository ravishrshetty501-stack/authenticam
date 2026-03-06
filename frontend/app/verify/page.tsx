'use client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { verificationAPI } from '@/lib/api';
import { sha256 } from 'js-sha256';
import toast from 'react-hot-toast';
import Link from 'next/link';

type Result = 'authentic' | 'tampered' | 'invalid_certificate' | 'error' | null;

interface VerifyResponse {
    result: Result;
    authentic: boolean;
    uploadedHash: string;
    expectedHash: string;
    tamperDetails: string | null;
    certificate: {
        certificateId: string;
        fileHash: string;
        timestamp: string;
        deviceFingerprint: string;
        chainOfCustody: Array<{ event: string; timestamp: string; actor: string }>;
        userId?: { username: string; email: string };
        recordingId?: { title: string };
    } | null;
    verificationId: string;
    timestamp: string;
}

export default function VerifyPage() {
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [certFile, setCertFile] = useState<File | null>(null);
    const [certJson, setCertJson] = useState('');
    const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
    const [result, setResult] = useState<VerifyResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [draggingMedia, setDraggingMedia] = useState(false);
    const [draggingCert, setDraggingCert] = useState(false);
    const [localHash, setLocalHash] = useState('');
    const [computingHash, setComputingHash] = useState(false);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const certInputRef = useRef<HTMLInputElement>(null);

    const computeLocalHash = useCallback(async (file: File) => {
        setComputingHash(true);
        try {
            const buffer = await file.arrayBuffer();
            const hash = sha256(new Uint8Array(buffer));
            setLocalHash(hash);
        } catch { setLocalHash(''); }
        finally { setComputingHash(false); }
    }, []);

    const handleMediaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); setDraggingMedia(false);
        const file = e.dataTransfer.files[0];
        if (file) { setMediaFile(file); computeLocalHash(file); }
    }, [computeLocalHash]);

    const handleCertDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); setDraggingCert(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            setCertFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setCertJson(ev.target?.result as string || '');
            reader.readAsText(file);
        }
    }, []);

    const handleVerify = async () => {
        if (!mediaFile) { toast.error('Please upload a media file'); return; }
        const certData = certFile ? certJson : certJson;
        if (!certData) { toast.error('Please provide a certificate'); return; }
        setLoading(true);
        setResult(null);
        try {
            const formData = new FormData();
            formData.append('media', mediaFile);
            formData.append('certificateJson', certData);
            const res = await verificationAPI.verify(formData);
            setResult(res.data);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            toast.error(error.response?.data?.error || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const resultColors: Record<string, string> = {
        authentic: 'var(--success)',
        tampered: 'var(--danger)',
        invalid_certificate: 'var(--warning)',
        error: 'var(--text-secondary)',
    };
    const resultIcons: Record<string, string> = {
        authentic: '✅',
        tampered: '🚨',
        invalid_certificate: '⚠️',
        error: '❌',
    };
    const resultLabels: Record<string, string> = {
        authentic: 'AUTHENTIC — Media has not been tampered with',
        tampered: 'TAMPERED — Media has been modified',
        invalid_certificate: 'INVALID CERTIFICATE — Could not validate',
        error: 'ERROR — Verification failed',
    };

    return (
        <div className="page-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="page-container" style={{ paddingBottom: '3rem', maxWidth: 920 }}>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="section-title">🔍 Verify Authenticity</h1>
                    <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
                        Upload any media file and its certificate JSON to instantly check if it has been tampered with.
                    </p>
                </motion.div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    {/* Media upload */}
                    <div className="glass" style={{ padding: '1.5rem' }}>
                        <label style={{ marginBottom: '12px' }}>📁 Media File</label>
                        <div
                            className={`drop-zone ${draggingMedia ? 'dragging' : ''}`}
                            style={{ padding: '2rem', minHeight: 160 }}
                            onDragOver={(e) => { e.preventDefault(); setDraggingMedia(true); }}
                            onDragLeave={() => setDraggingMedia(false)}
                            onDrop={handleMediaDrop}
                            onClick={() => mediaInputRef.current?.click()}
                        >
                            <input ref={mediaInputRef} type="file" accept="video/*,audio/*,image/*" style={{ display: 'none' }}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setMediaFile(f); computeLocalHash(f); } }} />
                            {mediaFile ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎬</div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px', wordBreak: 'break-all' }}>{mediaFile.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Drop media here or click</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Video, Audio, or Image</div>
                                </div>
                            )}
                        </div>
                        {localHash && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <label style={{ marginBottom: '4px' }}>
                                    Local Hash {computingHash && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>computing…</span>}
                                </label>
                                <div className="hash-display">{localHash}</div>
                            </div>
                        )}
                    </div>

                    {/* Certificate upload */}
                    <div className="glass" style={{ padding: '1.5rem' }}>
                        <label style={{ marginBottom: '12px' }}>📜 Certificate</label>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                            {(['file', 'paste'] as const).map((m) => (
                                <button key={m} onClick={() => setInputMode(m)} style={{
                                    padding: '4px 14px', border: 'none', borderRadius: 'var(--radius-full)',
                                    fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                    background: inputMode === m ? 'var(--primary)' : 'transparent',
                                    color: inputMode === m ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                }}>
                                    {m === 'file' ? '📄 Upload File' : '✏️ Paste JSON'}
                                </button>
                            ))}
                        </div>

                        {inputMode === 'file' ? (
                            <div
                                className={`drop-zone ${draggingCert ? 'dragging' : ''}`}
                                style={{ padding: '2rem', minHeight: 120 }}
                                onDragOver={(e) => { e.preventDefault(); setDraggingCert(true); }}
                                onDragLeave={() => setDraggingCert(false)}
                                onDrop={handleCertDrop}
                                onClick={() => certInputRef.current?.click()}
                            >
                                <input ref={certInputRef} type="file" accept=".json" style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]; if (!f) return;
                                        setCertFile(f);
                                        const reader = new FileReader();
                                        reader.onload = (ev) => setCertJson(ev.target?.result as string || '');
                                        reader.readAsText(f);
                                    }} />
                                {certFile ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{certFile.name}</div>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Drop .json certificate here</div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <textarea
                                value={certJson}
                                onChange={(e) => setCertJson(e.target.value)}
                                placeholder='Paste certificate JSON here…'
                                style={{
                                    width: '100%', height: 160, border: '1.5px solid var(--border-strong)',
                                    borderRadius: 'var(--radius-md)', padding: '0.75rem', fontFamily: 'monospace',
                                    fontSize: '0.75rem', resize: 'vertical', outline: 'none', color: 'var(--text-primary)',
                                }}
                            />
                        )}
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleVerify}
                        disabled={loading || !mediaFile || (!certJson)}
                    >
                        {loading ? <><span className="spinner" /> Verifying…</> : '🔍 Verify Authenticity'}
                    </button>
                </div>

                {/* Result */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.5 }}
                        >
                            {/* Status banner */}
                            <div style={{
                                padding: '1.5rem 2rem',
                                borderRadius: 'var(--radius-xl)',
                                marginBottom: '1.5rem',
                                background: result.result === 'authentic'
                                    ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                                    : result.result === 'tampered'
                                        ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
                                        : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                border: `2px solid ${resultColors[result.result || 'error']}`,
                                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                            }}>
                                <div style={{ fontSize: '3rem' }}>{resultIcons[result.result || 'error']}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: resultColors[result.result || 'error'] }}>
                                        {resultLabels[result.result || 'error']}
                                    </div>
                                    {result.tamperDetails && (
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                            {result.tamperDetails}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Verified at {new Date(result.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Hash comparison */}
                            <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Hash Comparison</h3>
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    <div>
                                        <label>Uploaded File Hash</label>
                                        <div className="hash-display">{result.uploadedHash}</div>
                                    </div>
                                    <div>
                                        <label>Certificate Hash (Expected)</label>
                                        <div className="hash-display">{result.expectedHash || 'Not found in certificate'}</div>
                                    </div>
                                    <div style={{
                                        padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                                        background: result.authentic ? 'var(--success-light)' : 'var(--danger-light)',
                                        fontSize: '0.85rem', fontWeight: 600,
                                        color: result.authentic ? 'var(--success)' : 'var(--danger)',
                                    }}>
                                        {result.authentic
                                            ? '✅ Hashes match — file is unmodified'
                                            : '❌ Hashes do not match — file has been altered'}
                                    </div>
                                </div>
                            </div>

                            {/* Certificate details */}
                            {result.certificate && (
                                <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Certificate Details</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                                        {[
                                            { label: 'Certificate ID', value: result.certificate.certificateId },
                                            { label: 'Recorded By', value: result.certificate.userId?.username || '—' },
                                            { label: 'Timestamp', value: new Date(result.certificate.timestamp).toLocaleString() },
                                            { label: 'Device Fingerprint', value: result.certificate.deviceFingerprint?.substring(0, 20) + '…' },
                                        ].map((row) => (
                                            <div key={row.label}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>{row.label}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{row.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Chain of custody */}
                                    {result.certificate.chainOfCustody && result.certificate.chainOfCustody.length > 0 && (
                                        <div style={{ marginTop: '1.25rem' }}>
                                            <h4 style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                                                ⛓️ Chain of Custody
                                            </h4>
                                            <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                                                <div className="timeline-line" />
                                                {result.certificate.chainOfCustody.map((ev, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                                                        <div className="timeline-dot" style={{ position: 'absolute', left: 10 }} />
                                                        <div style={{ marginLeft: '0.5rem' }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{ev.event}</div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                {new Date(ev.timestamp).toLocaleString()} • {ev.actor}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ marginTop: '1rem' }}>
                                        <Link href={`/certificate/${result.certificate.certificateId}`}>
                                            <button className="btn btn-secondary btn-sm">View Full Certificate →</button>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
