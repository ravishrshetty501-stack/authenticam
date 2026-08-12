'use client';
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/lib/store';
import { investigationAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function InvestigatePage() {
    const { isAuthenticated } = useAuthStore();
    
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [certFile, setCertFile] = useState<File | null>(null);
    const [isInvestigating, setIsInvestigating] = useState(false);
    const [investigationResult, setInvestigationResult] = useState<any>(null);
    
    // Feedback state
    const [feedbackDecision, setFeedbackDecision] = useState('');
    const [feedbackNotes, setFeedbackNotes] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    // Refs for drag and drop
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const certInputRef = useRef<HTMLInputElement>(null);

    const handleInvestigation = async () => {
        if (!mediaFile || !certFile) {
            toast.error('Please provide both a media file and its certificate');
            return;
        }

        setIsInvestigating(true);
        const loadingToast = toast.loading('Running AI evidence investigation...');

        try {
            // Read certificate file
            const certText = await certFile.text();
            try { JSON.parse(certText); } catch (e) {
                throw new Error("Invalid certificate JSON format");
            }

            const formData = new FormData();
            formData.append('media', mediaFile);
            formData.append('certificateJson', certText);

            const response = await investigationAPI.investigate(formData);
            setInvestigationResult(response.data);
            toast.success('Investigation complete!', { id: loadingToast });
        } catch (error: any) {
            console.error('Investigation error:', error);
            const errMsg = error.response?.data?.error || error.message || 'Investigation failed';
            toast.error(`Investigation Failed: ${errMsg}`, { id: loadingToast, duration: 5000 });
        } finally {
            setIsInvestigating(false);
        }
    };

    const handleSubmitFeedback = async () => {
        if (!investigationResult?.investigation?.caseId) return;
        if (!feedbackDecision) {
            toast.error('Please select a decision');
            return;
        }

        setIsSubmittingFeedback(true);
        
        try {
            await investigationAPI.submitFeedback(
                investigationResult.investigation.caseId, 
                { decision: feedbackDecision, notes: feedbackNotes }
            );
            toast.success('Feedback recorded. Hindsight memory updated.');
            setInvestigationResult({
                ...investigationResult,
                investigation: {
                    ...investigationResult.investigation,
                    investigatorDecision: feedbackDecision,
                    investigatorNotes: feedbackNotes
                }
            });
        } catch (error: any) {
            toast.error('Failed to submit feedback');
        } finally {
            setIsSubmittingFeedback(false);
        }
    };

    const getRiskBadge = (level: string) => {
        let badgeClass = 'badge-gray';
        if (level === 'LOW') badgeClass = 'badge-green';
        if (level === 'MEDIUM') badgeClass = 'badge-blue'; // Using blue for medium
        if (level === 'HIGH') badgeClass = 'badge-red'; // Using red for high/critical
        if (level === 'CRITICAL') badgeClass = 'badge-red';
        
        return (
            <span className={`badge ${badgeClass}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                {level} RISK
            </span>
        );
    };

    const getRecBadge = (rec: string) => {
        const color = rec.includes('AUTHENTIC') ? 'var(--success)' : rec.includes('TAMPERED') ? 'var(--danger)' : 'var(--warning)';
        return <span style={{ color, fontWeight: 800, fontSize: '1.2rem' }}>{rec.replace('_', ' ')}</span>;
    };

    return (
        <div className="page-content" style={{ paddingBottom: '4rem' }}>
            <div className="page-container">
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 className="section-title text-gradient">AI Evidence Intelligence</h1>
                        <p className="section-subtitle">
                            Investigate media authenticity using cryptographic evidence and Hindsight memory.
                        </p>
                    </div>
                    <Link href="/investigate/timeline" style={{ textDecoration: 'none' }}>
                        <button className="btn btn-secondary">
                            View Global Timeline →
                        </button>
                    </Link>
                </div>

                {!investigationResult ? (
                    /* Initial Upload State */
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass"
                        style={{ padding: '2rem' }}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                            {/* Media Upload */}
                            <div>
                                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>1. Target Media File</h3>
                                <div 
                                    className={`drop-zone ${mediaFile ? 'has-file' : ''}`}
                                    onClick={() => mediaInputRef.current?.click()}
                                    style={{ borderColor: mediaFile ? 'var(--primary)' : '', background: mediaFile ? 'var(--primary-bg)' : '' }}
                                >
                                    <input 
                                        type="file" 
                                        style={{ display: 'none' }} 
                                        ref={mediaInputRef}
                                        accept="video/*,audio/*,image/*"
                                        onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                                    />
                                    {mediaFile ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '2rem' }}>📄</div>
                                            <p style={{ fontWeight: 600 }}>{mediaFile.name}</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{(mediaFile.size / (1024*1024)).toFixed(2)} MB</p>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '2rem' }}>📤</div>
                                            <p style={{ color: 'var(--text-secondary)' }}>Click to select media file</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Certificate Upload */}
                            <div>
                                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>2. Proof-of-Reality Certificate</h3>
                                <div 
                                    className={`drop-zone ${certFile ? 'has-file' : ''}`}
                                    onClick={() => certInputRef.current?.click()}
                                    style={{ borderColor: certFile ? 'var(--accent)' : '', background: certFile ? 'rgba(6, 182, 212, 0.05)' : '' }}
                                >
                                    <input 
                                        type="file" 
                                        style={{ display: 'none' }}
                                        ref={certInputRef}
                                        accept=".json"
                                        onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                                    />
                                    {certFile ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: 'var(--accent)', marginBottom: '0.5rem', fontSize: '2rem' }}>🔑</div>
                                            <p style={{ fontWeight: 600 }}>{certFile.name}</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>JSON format</p>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '2rem' }}>📤</div>
                                            <p style={{ color: 'var(--text-secondary)' }}>Click to select certificate JSON</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={handleInvestigation}
                                disabled={isInvestigating || !mediaFile || !certFile}
                                className="btn btn-primary btn-lg"
                            >
                                {isInvestigating ? (
                                    <>
                                        <div className="spinner"></div>
                                        Analyzing Evidence...
                                    </>
                                ) : 'Run AI Investigation'}
                            </button>
                        </div>
                        
                        {!isAuthenticated && (
                            <p style={{ textAlign: 'center', color: 'var(--warning)', marginTop: '1.5rem', fontSize: '0.85rem' }}>
                                Note: You are investigating as a guest. Outcomes will not be permanently stored in your user profile, but will contribute to global Hindsight memory.
                            </p>
                        )}
                    </motion.div>

                ) : (

                    /* Investigation Results Dashboard */
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}
                    >
                        {/* Column 1 & 2: Primary Report */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            
                            {/* Main Verdict Card */}
                            <div className="glass-strong" style={{ padding: '2rem', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '4px' }}>INVESTIGATION REPORT</h2>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Space Grotesk' }}>
                                            {investigationResult.investigation.caseId}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                        {getRiskBadge(investigationResult.investigation.riskLevel)}
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            Confidence: <span style={{ fontWeight: 700 }}>
                                                {Math.round(investigationResult.investigation.confidenceScore * 100)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', background: 'var(--off-white)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>AI Agent Recommendation:</div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        {getRecBadge(investigationResult.investigation.recommendation)}
                                    </div>
                                    
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>AI Reasoning:</div>
                                    <blockquote style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1rem', color: 'var(--text-primary)', fontStyle: 'italic', fontSize: '0.95rem' }}>
                                        "{investigationResult.investigation.aiReport.reasoning}"
                                    </blockquote>
                                </div>
                                
                                {/* Evidence Breakdown */}
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Evidence Analysis</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                                        {[
                                            { key: 'hashIntegrity', label: 'Hash Integrity' },
                                            { key: 'signatureValid', label: 'RSA Signature' },
                                            { key: 'merkleIntegrity', label: 'Merkle Tree' },
                                            { key: 'watermarkIntact', label: 'Watermark' },
                                            { key: 'timestampValid', label: 'Timestamp' },
                                            { key: 'deviceKnown', label: 'Device Match' }
                                        ].map(check => {
                                            const status = investigationResult.investigation.aiReport.evidenceSummary[check.key].status;
                                            const isPass = status === 'PASS';
                                            return (
                                                <div key={check.key} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPass ? 'var(--success-light)' : 'var(--danger-light)', color: isPass ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                                                        {isPass ? '✓' : '✕'}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{check.label}</div>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{status}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Hindsight Pattern Analysis */}
                            {investigationResult.investigation.aiReport.patternAnalysis && (
                                <div style={{ background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)', border: '1px solid rgba(79, 70, 229, 0.2)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                                        <span style={{ fontSize: '1.5rem' }}>🧠</span>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>Hindsight Pattern Analysis</h3>
                                    </div>
                                    <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                        {investigationResult.investigation.aiReport.patternAnalysis}
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* Column 3: Sidebar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            
                            {/* Similar Cases (Hindsight Recall) */}
                            <div className="glass" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Similar Cases</h3>
                                    <span className="badge badge-gray">
                                        {investigationResult.investigation.aiReport.similarCases.length} found
                                    </span>
                                </div>
                                
                                {investigationResult.investigation.aiReport.similarCases.length === 0 ? (
                                    <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                                        No similar historical cases found in memory.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {investigationResult.investigation.aiReport.similarCases.map((c: any, i: number) => (
                                            <div key={i} style={{ background: 'white', border: '1px solid var(--border)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{c.caseId}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(c.similarity * 100).toFixed(0)}% match</span>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {c.summary}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Outcome:</span>
                                                    <span className={`badge ${c.outcome.includes('AUTHENTIC') ? 'badge-green' : c.outcome.includes('TAMPER') ? 'badge-red' : c.outcome === 'PENDING' ? 'badge-gray' : 'badge-blue'}`}>
                                                        {c.outcome}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Investigator Feedback Loop */}
                            <div className="glass" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>⚖️</span> Investigator Decision
                                </h3>
                                
                                {investigationResult.investigation.investigatorDecision ? (
                                    <div style={{ background: 'var(--success-light)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>Decision Recorded</div>
                                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px' }}>{investigationResult.investigation.investigatorDecision}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{investigationResult.investigation.investigatorNotes}"</div>
                                        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ✓ Saved to Hindsight memory
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            Confirm the outcome to help the AI learn for future cases.
                                        </p>
                                        
                                        <div>
                                            <label>Final Verdict</label>
                                            <select 
                                                className="input"
                                                value={feedbackDecision}
                                                onChange={e => setFeedbackDecision(e.target.value)}
                                            >
                                                <option value="" disabled>Select decision...</option>
                                                <option value="CONFIRMED_AUTHENTIC">Confirmed Authentic</option>
                                                <option value="CONFIRMED_TAMPERED">Confirmed Tampered</option>
                                                <option value="RE_ENCODED">Authentic but Re-encoded</option>
                                                <option value="INCONCLUSIVE">Inconclusive</option>
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label>Investigator Notes</label>
                                            <textarea 
                                                className="input"
                                                style={{ height: '80px', resize: 'vertical' }}
                                                placeholder="Document your findings here..."
                                                value={feedbackNotes}
                                                onChange={e => setFeedbackNotes(e.target.value)}
                                            ></textarea>
                                        </div>
                                        
                                        <button 
                                            onClick={handleSubmitFeedback}
                                            disabled={isSubmittingFeedback || !feedbackDecision}
                                            className="btn btn-primary"
                                            style={{ width: '100%', justifyContent: 'center' }}
                                        >
                                            {isSubmittingFeedback ? 'Saving...' : 'Submit & Teach AI'}
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
