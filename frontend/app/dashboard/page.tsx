'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { recordingsAPI } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Recording {
    _id: string;
    title: string;
    fileHash: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    status: string;
    createdAt: string;
    certificateId?: { certificateId: string; qrCodeData: string; verificationUrl: string };
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
function formatDuration(s: number) {
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function DashboardPage() {
    const { isAuthenticated, user } = useAuthStore();
    const router = useRouter();
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated) { router.push('/auth/login'); return; }
        fetchRecordings();
    }, [isAuthenticated, router]);

    const fetchRecordings = async () => {
        try {
            setLoading(true);
            const res = await recordingsAPI.list();
            setRecordings(res.data.recordings);
            setTotal(res.data.total);
        } catch {
            toast.error('Failed to load recordings');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this recording and its certificate?')) return;
        setDeleting(id);
        try {
            await recordingsAPI.delete(id);
            setRecordings((prev) => prev.filter((r) => r._id !== id));
            toast.success('Recording deleted');
        } catch {
            toast.error('Delete failed');
        } finally {
            setDeleting(null);
        }
    };

    const downloadCert = async (certId: string) => {
        const { certificatesAPI } = await import('@/lib/api');
        try {
            const res = await certificatesAPI.download(certId);
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = `certificate-${certId}.json`;
            a.click(); URL.revokeObjectURL(url);
        } catch {
            toast.error('Download failed');
        }
    };

    const certifiedCount = recordings.filter((r) => r.status === 'certified').length;

    return (
        <div className="page-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="page-container" style={{ paddingBottom: '3rem' }}>
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 className="section-title">Dashboard</h1>
                            <p className="section-subtitle">Welcome back, <strong>{user?.username}</strong>. Manage your authenticated recordings.</p>
                        </div>
                        <Link href="/record">
                            <button className="btn btn-primary">🎥 New Recording</button>
                        </Link>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        {[
                            { label: 'Total Recordings', value: total, icon: '🎬', color: 'var(--primary)' },
                            { label: 'Certified', value: certifiedCount, icon: '✅', color: 'var(--success)' },
                            { label: 'Account Type', value: user?.role || 'user', icon: '👤', color: 'var(--accent)' },
                        ].map((stat) => (
                            <div key={stat.label} className="glass" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                                    <div>
                                        <div style={{ fontFamily: 'Space Grotesk', fontSize: '1.4rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                                            {stat.value}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{stat.label}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Recordings */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
                    </div>
                ) : recordings.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="glass" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎥</div>
                        <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, marginBottom: '0.5rem' }}>No recordings yet</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            Start recording to create your first authenticated media file.
                        </p>
                        <Link href="/record"><button className="btn btn-primary">Start Recording</button></Link>
                    </motion.div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {recordings.map((rec, i) => (
                            <motion.div
                                key={rec._id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="card"
                                style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
                            >
                                {/* Icon */}
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                                    background: rec.mimeType?.startsWith('video') ? 'var(--primary-bg)' : 'rgba(6,182,212,0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
                                }}>
                                    {rec.mimeType?.startsWith('video') ? '🎬' : '🎵'}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>
                                        {rec.title || 'Untitled Recording'}
                                    </div>
                                    <div className="hash-display" style={{ fontSize: '0.7rem', marginBottom: '6px' }}>
                                        SHA-256: {rec.fileHash?.substring(0, 32)}…
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>{formatBytes(rec.fileSize)}</span>
                                        <span>{rec.duration > 0 ? formatDuration(rec.duration) : '—'}</span>
                                        <span>{new Date(rec.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                {/* Status */}
                                <span className={`badge ${rec.status === 'certified' ? 'badge-green' : 'badge-gray'}`}>
                                    {rec.status === 'certified' ? '✅ Certified' : rec.status}
                                </span>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    {rec.certificateId && (
                                        <>
                                            <button className="btn btn-secondary btn-sm" onClick={() => downloadCert(rec.certificateId!.certificateId)}>
                                                📥 Cert
                                            </button>
                                            <Link href={`/certificate/${rec.certificateId.certificateId}`}>
                                                <button className="btn btn-secondary btn-sm">View</button>
                                            </Link>
                                        </>
                                    )}
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => handleDelete(rec._id)}
                                        disabled={deleting === rec._id}
                                    >
                                        {deleting === rec._id ? <span className="spinner" /> : '🗑'}
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
