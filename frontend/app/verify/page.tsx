'use client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { verificationAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

type Overall = 'VALID' | 'TAMPERED' | 'UNKNOWN_DEVICE' | null;

interface Check {
    pass: boolean;
    details: string;
    error?: string | null;
    computedHash?: string;
    expectedHash?: string;
    computedRoot?: string;
    expectedRoot?: string;
    ageHours?: number;
    source?: string;
    confidence?: string;
}

interface VerifyResponse {
    // New structured report
    overall: Overall;
    checks: {
        hash: Check;
        signature: Check;
        merkle: Check;
        watermark: Check;
        timestamp: Check;
        fingerprint: Check;
    };
    summary: string;
    verifiedAt: string;
    // Backwards compat
    result: string;
    authentic: boolean;
    uploadedHash: string;
    expectedHash: string;
    tamperDetails: string | null;
    certificate: {
        certificateId: string;
        fileHash: string;
        timestamp: string;
        issuedAt?: string;
        deviceFingerprint: string;
        merkleRoot?: string;
        watermarkHash?: string;
        fingerprintHash?: string;
        blockchainAnchor?: {
            blockIndex: number;
            blockHash: string;
            timestamp: string;
        };
        timestampProof?: { iso: string; source: string; reliable: boolean };
        chainOfCustody: Array<{ event: string; timestamp: string; actor: string }>;
        userId?: { username: string; email: string };
        recordingId?: { title: string };
    } | null;
    timestamp: string;
}

const CHECK_META: Record<string, { label: string; icon: string; description: string }> = {
    hash: { label: 'File Hash (SHA-256)', icon: '#️⃣', description: 'Verifies file is byte-for-byte identical to the original' },
    signature: { label: 'RSA Digital Signature', icon: '✍️', description: 'Validates certificate was signed by the AuthentiCam device key' },
    merkle: { label: 'Merkle Tree Root', icon: '🌲', description: 'Confirms every 4KB chunk of the recording is unaltered' },
    watermark: { label: 'Fragile Watermark', icon: '💧', description: 'Detects any re-encoding or transcoding of the media file' },
    timestamp: { label: 'Timestamp Proof', icon: '🕐', description: 'Verifies the recording timestamp is valid and not in the future' },
    fingerprint: { label: 'Device Fingerprint', icon: '🔍', description: 'Validates that the recording originated from a known, logged device' },
};

export default function VerifyPage() {
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [certFile, setCertFile] = useState<File | null>(null);
    const [certJson, setCertJson] = useState('');
    const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
    const [result, setResult] = useState<VerifyResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [draggingMedia, setDraggingMedia] = useState(false);
    const [draggingCert, setDraggingCert] = useState(false);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const certInputRef = useRef<HTMLInputElement>(null);

    const handleMediaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); setDraggingMedia(false);
        const file = e.dataTransfer.files[0];
        if (file) setMediaFile(file);
    }, []);

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
        if (!certJson) { toast.error('Please provide a certificate'); return; }
        setLoading(true);
        setResult(null);
        try {
            const formData = new FormData();
            formData.append('media', mediaFile);
            formData.append('certificateJson', certJson);
            const res = await verificationAPI.verify(formData);
            setResult(res.data);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            toast.error(error.response?.data?.error || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const overall = result?.overall;

    const verdictConfig = {
        VALID: { color: '#10b981', bg: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '#10b981', icon: '✅', label: 'VALID — Media is authentic and unaltered' },
        TAMPERED: { color: '#ef4444', bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '#ef4444', icon: '🚨', label: 'TAMPERED — Media has been modified' },
        UNKNOWN_DEVICE: { color: '#f59e0b', bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '#f59e0b', icon: '⚠️', label: 'UNKNOWN DEVICE — Content intact but origin uncertain' },
    };

    return (
        <div className="page-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="page-container" style={{ paddingBottom: '3rem', maxWidth: 960 }}>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="section-title">🔍 Verify Authenticity</h1>
                    <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
                        Upload any media file and its AuthentiCam certificate to run a full 5-check authenticity analysis.
                    </p>
                </motion.div>

                {/* ── Input Grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    {/* Media upload */}
                    <div className="glass" style={{ padding: '1.5rem' }}>
                        <label style={{ marginBottom: '12px' }}>📁 Media File</label>
                        <div
                            className={`drop-zone ${draggingMedia ? 'dragging' : ''}`}
                            style={{ padding: '2rem', minHeight: 160, cursor: 'pointer' }}
                            onDragOver={(e) => { e.preventDefault(); setDraggingMedia(true); }}
                            onDragLeave={() => setDraggingMedia(false)}
                            onDrop={handleMediaDrop}
                            onClick={() => mediaInputRef.current?.click()}
                        >
                            <input ref={mediaInputRef} type="file" accept="video/*,audio/*,image/*" style={{ display: 'none' }}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) setMediaFile(f); }} />
                            {mediaFile ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                                        {mediaFile.type.startsWith('video') ? '🎬' : mediaFile.type.startsWith('audio') ? '🎵' : '🖼️'}
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all', marginBottom: 4 }}>{mediaFile.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        {(mediaFile.size / 1024 / 1024).toFixed(2)} MB • {mediaFile.type}
                                    </div>
                                    <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: '0.75rem', padding: '4px 10px' }}
                                        onClick={(e) => { e.stopPropagation(); setMediaFile(null); }}>
                                        ✕ Remove
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Drop media here or click</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Video, Audio, or Image</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Certificate upload */}
                    <div className="glass" style={{ padding: '1.5rem' }}>
                        <label style={{ marginBottom: '12px' }}>📜 Certificate JSON</label>
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
                                style={{ padding: '2rem', minHeight: 120, cursor: 'pointer' }}
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
                                        <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: '0.75rem', padding: '4px 10px' }}
                                            onClick={(e) => { e.stopPropagation(); setCertFile(null); setCertJson(''); }}>
                                            ✕ Remove
                                        </button>
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

                {/* Verify Button */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleVerify}
                        disabled={loading || !mediaFile || !certJson}
                        id="verify-button"
                    >
                        {loading ? <><span className="spinner" /> Running 5 checks…</> : '🔍 Verify Authenticity'}
                    </button>
                </div>

                {/* ── Results ── */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.5 }}
                        >
                            {/* ── Verdict Banner ── */}
                            {overall && verdictConfig[overall] && (
                                <div style={{
                                    padding: '1.75rem 2rem',
                                    borderRadius: 'var(--radius-xl)',
                                    marginBottom: '1.5rem',
                                    background: verdictConfig[overall].bg,
                                    border: `2px solid ${verdictConfig[overall].border}`,
                                    display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap',
                                }}>
                                    <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>{verdictConfig[overall].icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: verdictConfig[overall].color, fontFamily: 'Space Grotesk, sans-serif' }}>
                                            {verdictConfig[overall].label}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                                            {result.summary}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            Verified at {new Date(result.verifiedAt || result.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                    {/* Pass count badge */}
                                    {result.checks && (
                                        <div style={{
                                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                                            background: 'rgba(255,255,255,0.7)', fontWeight: 800,
                                            fontFamily: 'Space Grotesk', fontSize: '1.1rem',
                                            color: verdictConfig[overall].color,
                                            border: `1.5px solid ${verdictConfig[overall].border}`,
                                        }}>
                                            {Object.values(result.checks).filter(c => c.pass).length}/6
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 5 Check Rows ── */}
                            {result.checks && (
                                <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                    <h3 style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        🛡️ Authenticity Checks
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {(Object.entries(result.checks) as [string, Check][]).map(([key, check], i) => {
                                            const meta = CHECK_META[key] || { label: key, icon: '🔎', description: '' };
                                            return (
                                                <motion.div
                                                    key={key}
                                                    initial={{ opacity: 0, x: -12 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.08 }}
                                                    style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '1rem',
                                                        padding: '0.875rem 1rem',
                                                        borderRadius: 'var(--radius-md)',
                                                        background: check.pass
                                                            ? 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, transparent 100%)'
                                                            : 'linear-gradient(90deg, rgba(239,68,68,0.06) 0%, transparent 100%)',
                                                        border: `1px solid ${check.pass ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                                    }}
                                                >
                                                    {/* Pass/fail indicator */}
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: check.pass ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                                        fontSize: '1rem',
                                                    }}>
                                                        {check.pass ? '✓' : '✗'}
                                                    </div>

                                                    {/* Info */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                                            <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{meta.label}</span>
                                                            <span style={{
                                                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                                                                borderRadius: 'var(--radius-full)',
                                                                background: check.pass ? 'var(--success)' : 'var(--danger)',
                                                                color: 'white',
                                                            }}>
                                                                {check.pass ? 'PASS' : 'FAIL'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                                            {meta.description}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: check.pass ? 'var(--success)' : 'var(--danger)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                            {check.details}
                                                        </div>
                                                        {check.error && (
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px' }}>
                                                                Error: {check.error}
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Hash Comparison (always show) ── */}
                            <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>🔐 Hash Comparison</h3>
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    <div>
                                        <label>Uploaded File Hash (SHA-256)</label>
                                        <div className="hash-display">{result.uploadedHash || result.checks?.hash?.computedHash || '—'}</div>
                                    </div>
                                    <div>
                                        <label>Certificate Hash (Expected)</label>
                                        <div className="hash-display">{result.expectedHash || result.checks?.hash?.expectedHash || 'Not found in certificate'}</div>
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

                            {/* ── Blockchain Anchor Result ── */}
                            {result.certificate?.blockchainAnchor && (
                                <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(5,150,105,0.05) 100%)' }}>
                                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        ⛓️ Blockchain Anchor Verified
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <div style={{ color: 'var(--text-muted)' }}>Block Index</div>
                                        <div style={{ fontWeight: 700 }}>#{result.certificate.blockchainAnchor.blockIndex}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>Block Hash</div>
                                        <div className="hash-display" style={{ fontSize: '0.7rem' }}>{result.certificate.blockchainAnchor.blockHash}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>Anchored At</div>
                                        <div>{new Date(result.certificate.blockchainAnchor.timestamp).toLocaleString()}</div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                                        ✓ Recording hash is immutable in the tamper-evident ledger
                                    </div>
                                </div>
                            )}

                            {/* ── Certificate Details ── */}
                            {result.certificate && (
                                <div className="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>📜 Certificate Details</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                                        {[
                                            { label: 'Certificate ID', value: result.certificate.certificateId },
                                            { label: 'Recorded By', value: result.certificate.userId?.username || '—' },
                                            { label: 'Timestamp', value: new Date(result.certificate.issuedAt || result.certificate.timestamp).toLocaleString() },
                                            { label: 'Timestamp Source', value: result.certificate.timestampProof?.source === 'ntp' ? '🌐 NTP-synchronized' : '💻 System clock' },
                                            { label: 'Device Fingerprint', value: result.certificate.deviceFingerprint ? result.certificate.deviceFingerprint.substring(0, 24) + '…' : '—' },
                                            { label: 'Merkle Root', value: result.certificate.merkleRoot ? result.certificate.merkleRoot.substring(0, 20) + '…' : '— (legacy)' },
                                        ].map((row) => (
                                            <div key={row.label}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>{row.label}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{row.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Chain of Custody */}
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
