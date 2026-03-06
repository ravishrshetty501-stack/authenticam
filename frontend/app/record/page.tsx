'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { recordingsAPI } from '@/lib/api';
import { generateDeviceFingerprint, generateDeviceFingerprintFull } from '@/lib/fingerprint';
import toast from 'react-hot-toast';
import { sha256 } from 'js-sha256';
import { QRCodeSVG } from 'qrcode.react';

type Mode = 'record' | 'photo' | 'upload';
type Stage = 'idle' | 'recording' | 'preview' | 'uploading' | 'certified';

export default function RecordPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuthStore();

    // ─── mode ───────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>('record');

    // ─── shared state ───────────────────────────────────────────────────────
    const [stage, setStage] = useState<Stage>('idle');
    const [title, setTitle] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [certification, setCertification] = useState<{
        certificate: {
            certificateId: string;
            fileHash: string;
            qrCodeData: string;
            verificationUrl: string;
            signature: string;
            digitalSignature?: string;
            merkleRoot?: string;
            merkleLeafCount?: number;
            watermarkHash?: string;
            mimeType?: string;
            timestampProof?: { iso: string; source: string; reliable: boolean };
        };
        recording: { _id: string };
    } | null>(null);

    // ─── record-mode state ──────────────────────────────────────────────────
    const [timer, setTimer] = useState(0);
    const [liveHash, setLiveHash] = useState('');

    // ─── photo-mode state ───────────────────────────────────────────────────
    const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
    const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
    const [photoHash, setPhotoHash] = useState('');

    // ─── upload-mode state ──────────────────────────────────────────────────
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadHash, setUploadHash] = useState('');
    const [computingHash, setComputingHash] = useState(false);
    const [dragging, setDragging] = useState(false);

    // ─── refs ────────────────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const blobRef = useRef<Blob | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fingerprintRef = useRef('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ─── auth guard ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated) { router.push('/auth/login'); return; }
        // Use quick sync fingerprint immediately, upgrade to full async version
        fingerprintRef.current = generateDeviceFingerprint();
        generateDeviceFingerprintFull()
            .then(({ raw }) => { if (raw !== 'server-side') fingerprintRef.current = raw; })
            .catch(() => { /* keep sync version */ });
    }, [isAuthenticated, router]);

    // ─── re-attach stream every render ──────────────────────────────────────
    useEffect(() => {
        if (streamRef.current && videoRef.current && stage !== 'preview') {
            videoRef.current.srcObject = streamRef.current;
        }
    });

    // ─── camera helpers ──────────────────────────────────────────────────────
    const startCamera = useCallback(async () => {
        // navigator.mediaDevices is only available on HTTPS or localhost
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error('📷 Camera requires HTTPS. Access this page using https:// — e.g. https://172.20.199.120:3000');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: mode === 'record',
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err: unknown) {
            const error = err as Error;
            toast.error('Camera access failed: ' + error.message);
        }
    }, [mode]);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    // ─── start camera when in record or photo mode ───────────────────────────
    useEffect(() => {
        if (mode === 'record' || mode === 'photo') {
            // Reset state when switching to a camera mode
            setStage('idle');
            setPhotoDataUrl(null);
            setPhotoBlob(null);
            setPhotoHash('');
            blobRef.current = null;
            chunksRef.current = [];
            setLiveHash('');
            setTimer(0);
            startCamera();
        } else {
            // Upload mode — kill camera
            stopCamera();
        }
        return () => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // ─── helpers ─────────────────────────────────────────────────────────────
    const formatTime = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    // ─── RECORD MODE ─────────────────────────────────────────────────────────
    const startRecording = () => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        setLiveHash('');
        setTimer(0);

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm' : 'video/mp4';

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
                const combined = new Blob(chunksRef.current);
                const reader = new FileReader();
                reader.onload = () => {
                    const hash = sha256(new Uint8Array(reader.result as ArrayBuffer));
                    setLiveHash(hash);
                };
                reader.readAsArrayBuffer(combined);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            blobRef.current = blob;
            if (previewRef.current) previewRef.current.src = URL.createObjectURL(blob);
            setStage('preview');
        };

        recorder.start(500);
        setStage('recording');
        timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    };

    const stopRecording = () => {
        recorderRef.current?.stop();
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    const downloadVideo = () => {
        if (!blobRef.current) return;
        const ext = blobRef.current.type.includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blobRef.current);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDiscardRecording = () => {
        blobRef.current = null;
        chunksRef.current = [];
        setStage('idle');
        setLiveHash('');
        startCamera();
    };

    // ─── PHOTO MODE ───────────────────────────────────────────────────────────
    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setPhotoDataUrl(dataUrl);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            setPhotoBlob(blob);
            // Compute hash
            const buffer = await blob.arrayBuffer();
            setPhotoHash(sha256(new Uint8Array(buffer)));
            setStage('preview');
            stopCamera();
        }, 'image/jpeg', 0.92);
    };

    const retakePhoto = () => {
        setPhotoDataUrl(null);
        setPhotoBlob(null);
        setPhotoHash('');
        setStage('idle');
        startCamera();
    };

    const downloadPhoto = () => {
        if (!photoDataUrl) return;
        const a = document.createElement('a');
        a.href = photoDataUrl;
        a.download = `photo-${Date.now()}.jpg`;
        a.click();
    };

    // ─── UPLOAD MODE ─────────────────────────────────────────────────────────
    const handleFileSelect = async (file: File) => {
        setUploadFile(file);
        setUploadHash('');
        setComputingHash(true);
        try {
            const buffer = await file.arrayBuffer();
            setUploadHash(sha256(new Uint8Array(buffer)));
        } catch { setUploadHash(''); }
        finally { setComputingHash(false); }
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDiscardUpload = () => {
        setUploadFile(null);
        setUploadHash('');
    };

    // ─── SHARED: Save & Certify ──────────────────────────────────────────────
    const handleSaveAndCertify = async () => {
        let blob: Blob | null = null;
        let filename = '';
        let ext = '';

        if (mode === 'record') {
            blob = blobRef.current;
            ext = blob?.type.includes('mp4') ? 'mp4' : 'webm';
            filename = `recording-${Date.now()}.${ext}`;
        } else if (mode === 'photo') {
            blob = photoBlob;
            filename = `photo-${Date.now()}.jpg`;
        } else if (mode === 'upload') {
            blob = uploadFile;
            filename = uploadFile?.name || `upload-${Date.now()}`;
        }

        if (!blob) return;
        setStage('uploading');
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('media', blob, filename);
        formData.append('title', title || `${mode === 'record' ? 'Recording' : mode === 'photo' ? 'Photo' : 'Upload'} ${new Date().toLocaleString()}`);
        formData.append('deviceFingerprint', fingerprintRef.current);
        formData.append('duration', mode === 'record' ? String(timer) : '0');

        try {
            const res = await recordingsAPI.upload(formData, (pct) => setUploadProgress(pct));
            setCertification(res.data);
            setStage('certified');
            toast.success('Certified successfully!');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            toast.error(error.response?.data?.error || 'Upload failed');
            setStage('preview');
        }
    };

    // ─── Download Certificate ────────────────────────────────────────────────
    const downloadCert = async () => {
        if (!certification) return;
        try {
            // Fetch the full, server-generated certificate JSON (with all crypto proofs)
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const res = await fetch(
                `${API_URL}/certificates/${certification.certificate.certificateId}/download`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            if (!res.ok) throw new Error('Download failed');
            const certData = await res.json();
            const blob = new Blob([JSON.stringify(certData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificate-${certification.certificate.certificateId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // Fallback: build a partial cert from in-memory data (degraded but usable)
            const certData = {
                authenticam_certificate: {
                    certificateId: certification.certificate.certificateId,
                    fileHash: certification.certificate.fileHash,
                    signature: certification.certificate.signature,
                    digitalSignature: certification.certificate.digitalSignature,
                    merkleRoot: certification.certificate.merkleRoot,
                    merkleLeafCount: certification.certificate.merkleLeafCount,
                    watermarkHash: certification.certificate.watermarkHash,
                    timestampProof: certification.certificate.timestampProof,
                    verificationUrl: certification.certificate.verificationUrl,
                },
            };
            const blob = new Blob([JSON.stringify(certData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificate-${certification.certificate.certificateId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const downloadAuthenticMedia = async () => {
        if (!certification) return;
        const uploadId = certification.recording._id;
        try {
            console.log(`[downloadAuthenticMedia] Downloading recording: ${uploadId}`);
            const res = await recordingsAPI.download(uploadId);

            if (!res.data || res.status !== 200) {
                throw new Error(`Server returned status ${res.status}`);
            }

            console.log('[downloadAuthenticMedia] Received blob, size:', res.data.size);

            // Explicitly create blob with type from response if available
            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'video/mp4' });
            const url = URL.createObjectURL(blob);

            const ext = certification.certificate.mimeType?.includes('jpeg') ? 'jpg' :
                certification.certificate.mimeType?.includes('mp4') ? 'mp4' : 'webm';

            const a = document.createElement('a');
            a.href = url;
            a.download = `authentic-${certification.certificate.certificateId}.${ext}`;
            document.body.appendChild(a);
            a.click();

            // Small delay before removal/revocation to ensure browser handles it
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            toast.success('Authentic media downloaded!');
        } catch (err: any) {
            console.error('[downloadAuthenticMedia] Error:', err);
            const msg = err.response?.data?.error || err.message || 'Download failed';
            toast.error(`Authentic download failed: ${msg}`);
        }
    };

    const handleNewCapture = () => {
        setCertification(null);
        setStage('idle');
        setPhotoDataUrl(null);
        setPhotoBlob(null);
        setPhotoHash('');
        blobRef.current = null;
        setUploadFile(null);
        setUploadHash('');
        setLiveHash('');
        setTimer(0);
        setTitle('');
        if (mode === 'record' || mode === 'photo') startCamera();
    };

    // ─── helpers for uploading overlay ───────────────────────────────────────
    const isPreviewReady = stage === 'preview';
    const canCertify = isPreviewReady && (
        (mode === 'record' && !!blobRef.current) ||
        (mode === 'photo' && !!photoBlob) ||
        (mode === 'upload' && !!uploadFile)
    );

    const modeLabels: Record<Mode, string> = {
        record: '🎥 Record Video',
        photo: '📸 Take Photo',
        upload: '📤 Upload File',
    };

    return (
        <div className="page-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="page-container" style={{ paddingBottom: '3rem', maxWidth: 900 }}>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="section-title" style={{ marginBottom: '0.5rem' }}>
                        {stage === 'certified' ? '🎉 Media Certified' : `${modeLabels[mode]}`}
                    </h1>
                    <p className="section-subtitle" style={{ marginBottom: '1.25rem' }}>
                        {stage === 'idle' && mode === 'record' && 'Press record to begin. SHA-256 hash is computed live.'}
                        {stage === 'idle' && mode === 'photo' && 'Position yourself and press Capture Photo.'}
                        {stage === 'idle' && mode === 'upload' && 'Upload any photo or video from your device to certify it.'}
                        {stage === 'recording' && 'Recording in progress. Hash updates in real-time.'}
                        {stage === 'preview' && 'Review your media and save to get a certificate.'}
                        {stage === 'uploading' && 'Uploading and generating certificate…'}
                        {stage === 'certified' && 'Your media has been hashed, signed, and certified.'}
                    </p>

                    {/* ── Mode Tabs ── */}
                    {stage !== 'certified' && stage !== 'uploading' && (
                        <div style={{
                            display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.06)',
                            borderRadius: 'var(--radius-full)', padding: '5px', marginBottom: '1.5rem',
                            width: 'fit-content',
                        }}>
                            {(['record', 'photo', 'upload'] as Mode[]).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => { if (stage === 'idle' || stage === 'preview') setMode(m); }}
                                    style={{
                                        padding: '0.45rem 1.1rem', border: 'none',
                                        borderRadius: 'var(--radius-full)', fontFamily: 'inherit',
                                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                        background: mode === m ? 'white' : 'transparent',
                                        color: mode === m ? 'var(--primary)' : 'var(--text-secondary)',
                                        boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                                        transition: 'all 0.2s',
                                    }}>
                                    {modeLabels[m]}
                                </button>
                            ))}
                        </div>
                    )}
                </motion.div>

                <AnimatePresence mode="wait">
                    {stage !== 'certified' ? (
                        <motion.div key="recorder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>

                            {/* ────── LEFT: Camera / Preview / Drop-zone ────── */}
                            <div className="glass" style={{ padding: '1.25rem' }}>

                                {/* ── RECORD MODE ─────────────────────────────── */}
                                {mode === 'record' && (
                                    <>
                                        <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                                            <video ref={videoRef} autoPlay muted playsInline
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: stage === 'preview' ? 'none' : 'block' }} />
                                            <video ref={previewRef} controls
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: stage === 'preview' ? 'block' : 'none' }} />

                                            {stage === 'recording' && (
                                                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.55)', borderRadius: 'var(--radius-full)', padding: '4px 12px' }}>
                                                    <div className="recording-dot" />
                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}>{formatTime(timer)}</span>
                                                </div>
                                            )}

                                            {stage === 'uploading' && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                                    <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                                                    <div style={{ color: 'white', fontWeight: 600 }}>Uploading {uploadProgress}%</div>
                                                    <div style={{ width: '60%', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
                                                        <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {stage === 'idle' && (
                                                <button className="btn btn-primary btn-lg" onClick={startRecording}>
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'white' }} />
                                                    Start Recording
                                                </button>
                                            )}
                                            {stage === 'recording' && (
                                                <button className="btn btn-danger btn-lg" onClick={stopRecording}>
                                                    <div style={{ width: 10, height: 10, background: 'white', borderRadius: 2 }} />
                                                    Stop Recording
                                                </button>
                                            )}
                                            {stage === 'preview' && (
                                                <>
                                                    <button className="btn btn-ghost" onClick={handleDiscardRecording}>↩ Discard</button>
                                                    <button className="btn btn-secondary" onClick={downloadVideo} title="Download local draft without watermark">⬇ Draft (No Protect)</button>
                                                    <button className="btn btn-primary btn-lg" onClick={handleSaveAndCertify}>🔐 Save & Certify</button>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ── PHOTO MODE ─────────────────────────────── */}
                                {mode === 'photo' && (
                                    <>
                                        {/* Hidden canvas for snapshot */}
                                        <canvas ref={canvasRef} style={{ display: 'none' }} />

                                        <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                                            {/* Live camera feed */}
                                            <video ref={videoRef} autoPlay muted playsInline
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: photoDataUrl ? 'none' : 'block' }} />
                                            {/* Captured photo preview */}
                                            {photoDataUrl && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={photoDataUrl} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )}

                                            {stage === 'uploading' && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                                    <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                                                    <div style={{ color: 'white', fontWeight: 600 }}>Uploading {uploadProgress}%</div>
                                                    <div style={{ width: '60%', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
                                                        <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {stage === 'idle' && (
                                                <button className="btn btn-primary btn-lg" onClick={capturePhoto}>
                                                    📸 Capture Photo
                                                </button>
                                            )}
                                            {stage === 'preview' && (
                                                <>
                                                    <button className="btn btn-ghost" onClick={retakePhoto}>↩ Retake</button>
                                                    <button className="btn btn-secondary" onClick={downloadPhoto} title="Download local snapshot without watermark">⬇ Draft (No Protect)</button>
                                                    <button className="btn btn-primary btn-lg" onClick={handleSaveAndCertify}>🔐 Save & Certify</button>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ── UPLOAD MODE ────────────────────────────── */}
                                {mode === 'upload' && (
                                    <>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="video/*,image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                                        />

                                        {!uploadFile ? (
                                            <div
                                                className={`drop-zone ${dragging ? 'dragging' : ''}`}
                                                style={{ padding: '3rem 2rem', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
                                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                                onDragLeave={() => setDragging(false)}
                                                onDrop={handleDrop}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <div style={{ fontSize: '3rem' }}>📂</div>
                                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>Drop a file here or click to browse</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supports video and image files</div>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                                                    {uploadFile.type.startsWith('video') ? (
                                                        <video
                                                            src={URL.createObjectURL(uploadFile)}
                                                            controls
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={URL.createObjectURL(uploadFile)}
                                                            alt="Preview"
                                                            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                                                        />
                                                    )}
                                                    {stage === 'uploading' && (
                                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                                            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                                                            <div style={{ color: 'white', fontWeight: 600 }}>Uploading {uploadProgress}%</div>
                                                            <div style={{ width: '60%', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
                                                                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', gap: '10px', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <button className="btn btn-ghost" onClick={handleDiscardUpload}>↩ Change File</button>
                                                    <button className="btn btn-primary btn-lg" onClick={handleSaveAndCertify} disabled={!uploadFile || stage === 'uploading'}>
                                                        🔐 Save & Certify
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* ────── RIGHT: Info Panel ────── */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Title */}
                                <div className="glass" style={{ padding: '1.25rem' }}>
                                    <label>Title</label>
                                    <input className="input" placeholder="Give your media a name…" value={title} onChange={(e) => setTitle(e.target.value)} />
                                </div>

                                {/* Device fingerprint */}
                                <div className="glass" style={{ padding: '1.25rem' }}>
                                    <label style={{ marginBottom: '8px' }}>🖥️ Device Fingerprint</label>
                                    <div className="hash-display">{fingerprintRef.current || 'Generating…'}</div>
                                </div>

                                {/* Live / computed hash */}
                                <div className="glass" style={{ padding: '1.25rem' }}>
                                    <label style={{ marginBottom: '8px' }}>
                                        🔐 SHA-256 Hash
                                        {stage === 'recording' && (
                                            <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--success)', animation: 'pulse-dot 1s infinite', fontWeight: 400 }}>
                                                updating…
                                            </span>
                                        )}
                                        {computingHash && (
                                            <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>computing…</span>
                                        )}
                                    </label>
                                    {(() => {
                                        const hash = mode === 'record' ? liveHash : mode === 'photo' ? photoHash : uploadHash;
                                        return hash ? (
                                            <div className="hash-display">{hash}</div>
                                        ) : (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.5rem 0' }}>
                                                {mode === 'record' ? 'Hash will appear when recording starts' :
                                                    mode === 'photo' ? 'Hash will appear after capture' :
                                                        'Hash will appear after file selection'}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Timer (record mode only) */}
                                {stage === 'recording' && (
                                    <motion.div className="glass" style={{ padding: '1.25rem', textAlign: 'center' }}
                                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                                        <div style={{ fontSize: '2.5rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--danger)' }}>{formatTime(timer)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Recording Duration</div>
                                    </motion.div>
                                )}

                                {/* Upload file info */}
                                {mode === 'upload' && uploadFile && (
                                    <div className="glass" style={{ padding: '1.25rem' }}>
                                        <label style={{ marginBottom: '8px' }}>📁 File Info</label>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{uploadFile.name}</div>
                                            <div>{(uploadFile.size / 1024 / 1024).toFixed(2)} MB • {uploadFile.type || 'unknown'}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Photo stage = preview hint */}
                                {mode === 'photo' && stage === 'preview' && photoHash && (
                                    <div className="glass" style={{ padding: '1.25rem' }}>
                                        <label style={{ marginBottom: '8px' }}>📸 Photo Captured</label>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            JPEG snapshot ready to certify.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        /* ── Certified View ── */
                        <motion.div key="certified"
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
                            <div className="glass" style={{ padding: '2rem' }}>
                                <div style={{
                                    padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem',
                                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                    border: '2px solid var(--success)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                                        <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: '1.1rem' }}>
                                            Authenticity Certificate Generated
                                        </span>
                                    </div>
                                    <p style={{ color: '#065f46', fontSize: '0.85rem' }}>
                                        Your media has been hashed with SHA-256, digitally signed, and securely stored.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div><label>Certificate ID</label><div className="hash-display">{certification?.certificate.certificateId}</div></div>
                                    <div><label>File Hash (SHA-256)</label><div className="hash-display">{certification?.certificate.fileHash}</div></div>

                                    {/* Merkle root */}
                                    {certification && certification.certificate.merkleRoot && (
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                🌲 Merkle Root
                                                <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 400 }}>
                                                    {certification.certificate.merkleLeafCount} chunks
                                                </span>
                                            </label>
                                            <div className="hash-display">{certification.certificate.merkleRoot}</div>
                                        </div>
                                    )}

                                    {/* Watermark hash */}
                                    {certification && certification.certificate.watermarkHash && (
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                💧 Watermark Hash
                                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'var(--success)', color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>EMBEDDED</span>
                                            </label>
                                            <div className="hash-display">{certification.certificate.watermarkHash}</div>
                                        </div>
                                    )}

                                    {/* Timestamp proof */}
                                    {certification && certification.certificate.timestampProof && (
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                🕐 Timestamp Proof
                                                <span style={{
                                                    fontSize: '0.7rem', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600,
                                                    background: certification.certificate.timestampProof.source === 'ntp' ? 'var(--success)' : 'var(--warning)',
                                                    color: 'white',
                                                }}>
                                                    {certification.certificate.timestampProof.source === 'ntp' ? 'NTP' : 'SYSTEM'}
                                                </span>
                                            </label>
                                            <div className="hash-display">{certification.certificate.timestampProof.iso}</div>
                                        </div>
                                    )}

                                    <div>
                                        <label>Digital Signature (RSA)</label>
                                        <div className="hash-display" style={{ maxHeight: 60, overflow: 'hidden' }}>
                                            {(certification?.certificate.digitalSignature || certification?.certificate.signature)?.substring(0, 80)}…
                                        </div>
                                    </div>
                                    <div><label>Verification URL</label><div className="hash-display">{certification?.certificate.verificationUrl}</div></div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                                    <button className="btn btn-primary" onClick={downloadAuthenticMedia} style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>
                                        📥 Download Authentic {mode === 'photo' ? 'Photo' : 'Video'}
                                    </button>
                                    <button className="btn btn-secondary" onClick={downloadCert}>📥 Download Certificate JSON</button>
                                    <button className="btn btn-ghost" style={{ border: '1.5px solid var(--border)' }} onClick={() => router.push('/dashboard')}>Dashboard</button>
                                    <button className="btn btn-ghost" onClick={handleNewCapture}>
                                        {mode === 'record' ? '🎥 New Recording' : mode === 'photo' ? '📸 New Photo' : '📤 New Upload'}
                                    </button>
                                </div>
                                <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Note: Use the <strong>Authentic {mode === 'photo' ? 'Photo' : 'Video'}</strong> for verification. It contains the embedded fragile watermark.
                                </p>
                            </div>

                            {/* QR Code */}
                            <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ display: 'block' }}>🔗 Verification QR Code</label>
                                {certification?.certificate.verificationUrl && (
                                    <div style={{ padding: '1rem', background: 'white', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                        <QRCodeSVG value={certification.certificate.verificationUrl} size={192} level="H" style={{ display: 'block' }} />
                                    </div>
                                )}
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    Scan to verify this media&apos;s authenticity from any device
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
