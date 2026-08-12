'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { investigationAPI } from '@/lib/api';
import Link from 'next/link';

export default function TimelinePage() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [fingerprint, setFingerprint] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (deviceId?: string) => {
        setLoading(true);
        try {
            if (deviceId) {
                const res = await investigationAPI.getDeviceHistory(deviceId);
                setHistory(res.data.investigations || []);
            } else {
                const [listRes, statsRes] = await Promise.all([
                    investigationAPI.list(1, 50),
                    investigationAPI.getStats()
                ]);
                setHistory(listRes.data.investigations || []);
                setStats(statsRes.data);
            }
        } catch (error) {
            console.error('Failed to load timeline:', error);
        } finally {
            setLoading(false);
            setIsSearching(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSearching(true);
        loadData(fingerprint || undefined);
    };

    const getRiskColor = (level: string) => {
        if (level === 'LOW') return 'var(--success)';
        if (level === 'MEDIUM') return 'var(--primary)';
        if (level === 'HIGH') return 'var(--warning)';
        if (level === 'CRITICAL') return 'var(--danger)';
        return 'var(--text-muted)';
    };

    return (
        <div className="page-content" style={{ paddingBottom: '4rem' }}>
            <div className="page-container" style={{ maxWidth: '800px' }}>
                
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <Link href="/investigate" style={{ display: 'inline-block', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        ← Back to Investigation
                    </Link>
                    <h1 className="section-title text-gradient" style={{ marginBottom: '1rem', fontSize: '2.5rem' }}>Memory Timeline</h1>
                    <p className="section-subtitle" style={{ maxWidth: '600px', margin: '0 auto', fontSize: '1.1rem' }}>
                        A chronological view of Hindsight's investigation memory, showing patterns of authenticity and tampering over time.
                    </p>
                </div>

                {/* Search & Stats */}
                <div className="glass" style={{ padding: '1.5rem', marginBottom: '3rem' }}>
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
                        <input 
                            type="text" 
                            placeholder="Filter by Device Fingerprint..." 
                            value={fingerprint}
                            onChange={e => setFingerprint(e.target.value)}
                            className="input"
                            style={{ flex: 1 }}
                        />
                        <button 
                            type="submit" 
                            disabled={isSearching}
                            className="btn btn-primary"
                        >
                            {isSearching ? 'Filtering...' : 'Filter'}
                        </button>
                    </form>
                    
                    {!fingerprint && stats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Cases</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.totalInvestigations}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Unique Devices</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.uniqueDevices}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tampered Finds</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>{stats.recommendationDistribution?.CONFIRMED_TAMPERED || 0}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hindsight Memories</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{stats.hindsightRetained}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Timeline */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                        <div className="spinner spinner-dark" style={{ margin: '0 auto 1rem auto' }}></div>
                        <div style={{ color: 'var(--text-secondary)' }}>Loading timeline...</div>
                    </div>
                ) : history.length === 0 ? (
                    <div className="glass" style={{ textAlign: 'center', padding: '4rem 0' }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No investigations found.</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Run some cases through the AI Investigation Agent first.</div>
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        {/* Center Line */}
                        <div className="timeline-line"></div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {history.map((inv, idx) => {
                                const date = new Date(inv.createdAt).toLocaleDateString('en-US', { 
                                    month: 'short', day: 'numeric', year: 'numeric' 
                                });
                                
                                return (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-100px" }}
                                        key={inv.caseId} 
                                        style={{ position: 'relative', display: 'flex', width: '100%' }}
                                    >
                                        {/* Timeline Dot */}
                                        <div className="timeline-dot"></div>
                                        
                                        {/* Card */}
                                        <div className="card" style={{ width: 'calc(100% - 40px)', marginLeft: '40px', padding: '1.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>{inv.caseId}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{date}</span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getRiskColor(inv.riskLevel) }}></div>
                                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.recommendation.replace('_', ' ')}</span>
                                            </div>
                                            
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {inv.aiReport?.reasoning || 'No reasoning available.'}
                                            </p>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={inv.deviceFingerprint}>
                                                    Device: {inv.deviceFingerprint.substring(0, 8)}...
                                                </span>
                                                {inv.investigatorDecision ? (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        ✓ Taught AI
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>Pending Review</span>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
