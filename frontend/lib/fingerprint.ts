/**
 * fingerprint.ts — Enhanced Device Fingerprint for AuthentiCam
 *
 * Collects multiple high-entropy browser signals:
 *   1. Navigator (UA, language, platform, hardware)
 *   2. Screen (resolution, color depth, pixel ratio, color gamut)
 *   3. Canvas 2D rendering fingerprint
 *   4. WebGL vendor/renderer info
 *   5. AudioContext noise fingerprint (oscillator samples)
 *   6. Timezone + locale
 *
 * Returns both a raw string (for backwards compat) and a SHA-256 hash
 * computed via SubtleCrypto (async) for stronger identification.
 */

/** Extended navigator types */
interface ExtendedNavigator extends Navigator {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number };
}

/**
 * Collect fingerprint components synchronously.
 * Returns an array of string tokens.
 */
function collectComponents(): string[] {
    if (typeof window === 'undefined') return ['server-side'];

    const nav = navigator as ExtendedNavigator;
    const components: string[] = [
        // ── Navigator ──────────────────────────────────────────
        nav.userAgent,
        nav.language || 'unknown',
        nav.languages?.join(',') || 'unknown',
        nav.platform || 'unknown',
        String(nav.hardwareConcurrency || 'unknown'),
        String(nav.maxTouchPoints || 0),
        String(nav.deviceMemory || 'unknown'),
        nav.connection?.effectiveType || 'unknown',
        String(nav.cookieEnabled),
        String(nav.doNotTrack || 'unknown'),

        // ── Screen ─────────────────────────────────────────────
        `${screen.width}x${screen.height}`,
        String(screen.colorDepth),
        String(window.devicePixelRatio || 1),
        String(screen.availWidth) + 'x' + String(screen.availHeight),

        // ── Color gamut ────────────────────────────────────────
        String(window.matchMedia?.('(color-gamut: p3)').matches),

        // ── Timezone / locale ──────────────────────────────────
        String(new Date().getTimezoneOffset()),
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
        Intl.DateTimeFormat().resolvedOptions().locale || 'unknown',
    ];

    // ── Canvas 2D fingerprint ────────────────────────────────
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.textBaseline = 'top';
            ctx.font = '14px "Arial"';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('AuthentiCam🔐', 2, 2);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('AuthentiCam🔐', 4, 17);
            components.push(canvas.toDataURL());
        }
    } catch { /* sandboxed */ }

    // ── WebGL fingerprint ─────────────────────────────────────
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                components.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'unknown');
                components.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown');
            }
            components.push(gl.getParameter(gl.VERSION) || 'unknown');
            components.push(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || 'unknown');
        }
    } catch { /* sandboxed */ }

    return components;
}

/**
 * Build a simple 32-bit hash of a string (fast, synchronous).
 * Used for the legacy raw fingerprint.
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a device fingerprint string (synchronous, backwards-compatible).
 * Returns a short hex string for UI display and legacy API calls.
 */
export function generateDeviceFingerprint(): string {
    if (typeof window === 'undefined') return 'server-side';
    const components = collectComponents();
    const raw = components.join('|');
    return simpleHash(raw) + '-' + raw.length.toString(16);
}

/**
 * Generate a full device fingerprint including a strong SHA-256 hash.
 * Async because SubtleCrypto.digest() is async.
 *
 * @returns {{ raw: string, sha256: string, components: string[] }}
 */
export async function generateDeviceFingerprintFull(): Promise<{
    raw: string;
    sha256: string;
    components: string[];
}> {
    if (typeof window === 'undefined') {
        return { raw: 'server-side', sha256: 'server-side', components: [] };
    }

    // ── AudioContext noise fingerprint ────────────────────────
    const components = collectComponents();
    try {
        const ctx = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
        const oscillator = ctx.createOscillator();
        const analyser = ctx.createAnalyser();
        const gainNode = ctx.createGain();
        const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);

        gainNode.gain.value = 0; // silent
        oscillator.type = 'triangle';
        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gainNode);
        gainNode.connect(ctx.destination);

        const audioFingerprint = await new Promise<string>((resolve) => {
            scriptProcessor.onaudioprocess = (event) => {
                const output = event.inputBuffer.getChannelData(0);
                const sample = Array.from(output.slice(0, 20)).map((n) => n.toFixed(8)).join(',');
                resolve(sample);
                oscillator.disconnect();
                scriptProcessor.disconnect();
                ctx.close();
            };
            oscillator.start(0);
        });
        components.push('audio:' + audioFingerprint);
    } catch { /* AudioContext blocked */ }

    const raw = components.join('|');

    // SHA-256 via SubtleCrypto
    let sha256 = simpleHash(raw); // fallback
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(raw);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* SubtleCrypto not available (HTTP) */ }

    return { raw, sha256, components };
}
