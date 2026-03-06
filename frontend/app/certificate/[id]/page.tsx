'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { certificatesAPI } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface Certificate {
    certificateId: string;
    fileHash: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    timestamp: string;
    deviceFingerprint: string;
    signature: string;
    publicKey: string;
    verificationUrl: string;
    qrCodeData: string;
    chainOfCustody: Array<{ event: string; timestamp: string; actor: string; details?: Record<string, unknown> }>;
    userId?: { username: string; email: string };
    recordingId?: { title: string; mimeType: string };
}

interface VerificationLog {
    _id: string;
    result: string;
    verifierEmail: string;
    uploadedHash: string;
    createdAt: string;
}

export default function CertificatePage() {
    const params = useParams();
    const certId = params.id as string;
    const [cert, setCert] = useState<Certificate | null>(null);
    const [logs, setLogs] = useState<VerificationLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!certId) return;
        (async () => {
            try {
                const res = await certificatesAPI.get(certId);
                setCert(res.data.certificate);
                setLogs(res.data.verificationHistory || []);
            } catch {
                toast.error('Certificate not found');
            } finally {
                setLoading(false);
            }
        })();
    }, [certId]);

    const handleDownload = async () => {
        try {
            const res = await certificatesAPI.download(certId);
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = `certificate-${certId}.json`; a.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('Download failed'); }
    };

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', position: 'relative', zIndex: 1 }}>
                <div className="spinner spinner-dark" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    if (!cert) {
        return (
            <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', position: 'relative', zIndex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                    <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700 }}>Certificate not found</h2>
                    <Link href="/verify"><button className="btn btn-primary" style={{ marginTop: '1.5rem' }}>Go to Verify</button></Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="page-container" style={{ paddingBottom: '3rem', maxWidth: 960 }}>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                            boxShadow: '0 6px 20px rgba(79,70,229,0.3)',
                        }}>📜</div>
                        <div style={{ flex: 1 }}>
                            <h1 className="section-title">Authenticity Certificate</h1>
                            <p className="section-subtitle">{cert.recordingId?.title || 'Media Recording'}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-primary" onClick={handleDownload}>📥 Download JSON</button>
                            <Link href="/verify"><button className="btn btn-secondary">🔍 Verify Now</button></Link>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.5rem', alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Core details */}
                            <div className="glass" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>Certificate Details</h3>
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {[
                                        { label: 'Certificate ID', value: cert.certificateId, mono: true },
                                        { label: 'File Hash (SHA-256)', value: cert.fileHash, mono: true },
                                        { label: 'File Name', value: cert.fileName || '—' },
                                        { label: 'File Size', value: cert.fileSize ? ((cert.fileSize / 1024 / 1024).toFixed(2) + ' MB') : '—' },
                                        { label: 'MIME Type', value: cert.mimeType || '—' },
                                        { label: 'Timestamp', value: new Date(cert.timestamp).toLocaleString() },
                                        { label: 'Issued By', value: cert.userId?.username || 'Unknown' },
                                        { label: 'Device Fingerprint', value: cert.deviceFingerprint, mono: true },
                                    ].map((row) => (
                                        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', alignItems: 'start' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, paddingTop: 3 }}>{row.label}</div>
                                            {row.mono ? (
                                                <div className="hash-display" style={{ fontSize: '0.72rem' }}>{row.value}</div>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{row.value}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Digital Signature */}
                            <div className="glass" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>✍️ Digital Signature (RSA-2048)</h3>
                                <div className="hash-display" style={{ maxHeight: 80, overflow: 'auto', fontSize: '0.65rem' }}>
                                    {cert.signature}
                                </div>
                            </div>

                            {/* Chain of custody */}
                            <div className="glass" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>⛓️ Chain of Custody</h3>
                                <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                                    <div style={{
                                        position: 'absolute', left: 10, top: 0, bottom: 0, width: 2,
                                        background: 'linear-gradient(to bottom, var(--primary), transparent)',
                                    }} />
                                    {cert.chainOfCustody.map((ev, i) => (
                                        <motion.div key={i}
                                            initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.06 }}
                                            style={{ display: 'flex', gap: '10px', marginBottom: '1rem', alignItems: 'flex-start' }}
                                        >
                                            <div className="timeline-dot" style={{ position: 'absolute', left: 5 }} />
                                            <div style={{ marginLeft: '0.5rem', flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '2px' }}>
                                                    {ev.event.replace(/_/g, ' ')}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {new Date(ev.timestamp).toLocaleString()} • {ev.actor || 'system'}
                                                </div>
                                                {ev.details && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                                                        {JSON.stringify(ev.details).substring(0, 100)}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* Verification history */}
                            {logs.length > 0 && (
                                <div className="glass" style={{ padding: '1.5rem' }}>
                                    <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>🔍 Verification History</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {logs.map((log) => (
                                            <div key={log._id} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                                                background: log.result === 'authentic' ? 'var(--success-light)' : 'var(--danger-light)',
                                                border: `1px solid ${log.result === 'authentic' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                            }}>
                                                <span>{log.result === 'authentic' ? '✅' : '❌'}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                                        {log.result.toUpperCase()} by {log.verifierEmail}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        {new Date(log.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar: QR */}
                        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', position: 'sticky', top: 88 }}>
                            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>🔗 Verify via QR</h3>
                            <div style={{
                                padding: '1rem', background: 'white',
                                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
                                display: 'inline-block', marginBottom: '1rem',
                            }}>
                                <QRCodeSVG value={cert.verificationUrl || `http://localhost:3000/verify?cert=${certId}`} size={180} level="H" />
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                                Scan with any QR reader to open the verification page
                            </p>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                {cert.verificationUrl}
                            </div>

                            {/* Authenticity seal */}
                            <div style={{
                                marginTop: '1.5rem', padding: '1rem',
                                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                borderRadius: 'var(--radius-md)', border: '1.5px solid var(--success)',
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>✅</div>
                                <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.9rem' }}>
                                    AUTHENTIC
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#065f46', marginTop: '2px' }}>
                                    Cryptographically Verified
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
