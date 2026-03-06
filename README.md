# AuthentiCam — Proof-of-Reality Recording Authentication

> **Hackathon-Level Implementation** — Deepfake Detection & Media Authenticity System

AuthentiCam provides cryptographic proof that audio/video recordings are authentic and unaltered at the moment of capture. Every recording generates a **Proof-of-Reality Certificate** backed by 5 independent security layers.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AuthentiCam v2.0                         │
├──────────────────────────┬──────────────────────────────────────┤
│      FRONTEND (Next.js)  │        BACKEND (Express + Node)      │
│                          │                                       │
│  WebRTC Capture          │  /utils/merkle.js    ← Merkle Tree   │
│  SHA-256 Live Hash       │  /utils/watermark.js ← DCT Watermark │
│  Device Fingerprint      │  /utils/crypto.js    ← RSA Sign/Hash │
│  QR Code Display         │  /utils/fingerprint.js ← PRNU       │
│  5-Check Verify UI       │  /utils/timestamp.js ← NTP           │
│                          │  /utils/certificate.js ← Generator  │
│                          │  /utils/verifier.js  ← Full Checker  │
│                          │  /cli/verify.js      ← CLI Tool      │
└──────────────────────────┴──────────────────────────────────────┘
```

---

## 8 Security Modules

| # | Module | Implementation |
|---|--------|---------------|
| 1 | **Secure Capture** | WebRTC frame recording, real-time SHA-256 hash display |
| 2 | **Sensor Fingerprint** | Browser canvas/WebGL/AudioContext noise + enriched SHA-256 |
| 3 | **Hash Chain (Merkle)** | SHA-256 Merkle tree over 4KB chunks → Merkle root in certificate |
| 4 | **Digital Signature** | RSA-2048 PKCS#1v1.5 sign/verify via `node-forge` |
| 5 | **Fragile Watermark** | Spread-spectrum HMAC-SHA256 XOR in file trailer (32 bytes) |
| 6 | **Trusted Timestamp** | NTP via `pool.ntp.org` with system-clock fallback + log |
| 7 | **Proof-of-Reality Cert** | JSON v2.0 certificate with all proofs + QR code |
| 8 | **Verification Tool** | 5-check verifier + REST API + CLI offline tool |

---

## Directory Structure

```
AuthentiCam/
├── backend/
│   ├── cli/
│   │   └── verify.js           ← Offline CLI verification tool
│   ├── certificate/
│   │   └── schema.json         ← JSON Schema v2.0 for certificates
│   ├── models/
│   │   ├── Certificate.js      ← Extended with Merkle/watermark fields
│   │   ├── Recording.js
│   │   ├── User.js
│   │   └── VerificationLog.js
│   ├── routes/
│   │   ├── recordings.js       ← Upload + Merkle + watermark + NTP
│   │   ├── verification.js     ← Full 5-check verifier
│   │   ├── certificates.js     ← v2.0 download schema
│   │   └── auth.js
│   ├── tests/
│   │   ├── merkle.test.js      ← 10 Merkle tree tests
│   │   ├── crypto.test.js      ← SHA-256 + RSA sign/verify tests
│   │   └── watermark.test.js   ← 8 watermark embed/detect tests
│   └── utils/
│       ├── merkle.js           ← Merkle tree implementation
│       ├── watermark.js        ← Fragile watermark embed/detect
│       ├── fingerprint.js      ← Device fingerprint enrichment
│       ├── timestamp.js        ← NTP-anchored timestamps
│       ├── certificate.js      ← Proof-of-Reality generator
│       ├── verifier.js         ← Full 5-check verifier
│       └── crypto.js           ← SHA-256, RSA keys, AES encrypt
└── frontend/
    ├── app/
    │   ├── record/page.tsx     ← Shows Merkle root + watermark + NTP badge
    │   └── verify/page.tsx     ← Full 5-check Authenticity Report UI
    └── lib/
        ├── fingerprint.ts      ← Enhanced: AudioContext + SubtleCrypto SHA-256
        └── crypto.ts           ← Client Merkle tree + SHA-256 helpers
```

---

## Certificate Format (v2.0)

```json
{
  "authenticam_certificate": {
    "certificateId": "uuid-v4",
    "version": "2.0",
    "issuedAt": "2026-03-06T15:44:00.000Z",
    "fileHash": "sha256-hex (64 chars)",
    "merkleRoot": "sha256-hex — root of 4KB chunk Merkle tree",
    "merkleLeafCount": 42,
    "watermarkHash": "sha256-hex — fragile watermark region",
    "digitalSignature": "RSA-2048 base64",
    "publicKey": "PEM",
    "deviceFingerprint": "browser-fingerprint-string",
    "fingerprintHash": "sha256-hex of enriched fingerprint",
    "timestampProof": {
      "iso": "2026-03-06T15:44:00.000Z",
      "source": "ntp",
      "ntpServer": "pool.ntp.org",
      "ntpOffset": -12,
      "reliable": true
    },
    "algorithmVersions": {
      "hashAlgorithm": "SHA-256",
      "signatureAlgorithm": "RSA-2048-PKCS1v15-SHA256",
      "merkleHashAlgorithm": "SHA-256",
      "merkleChunkSize": "4096 bytes",
      "watermarkAlgorithm": "Spread-Spectrum-HMAC-SHA256-XOR",
      "certificateVersion": "2.0"
    }
  }
}
```

---

## CLI Verification Tool

```bash
# Offline verification — no network required
cd backend
node cli/verify.js path/to/recording.webm path/to/certificate.json

# Output:
# ✓ PASS  Hash (SHA-256)       SHA-256 matches: a1b2c3d4e5f6…
# ✓ PASS  RSA Signature        RSA-2048 signature verified
# ✓ PASS  Merkle Tree Root     Merkle root matches (42 chunks)
# ✓ PASS  Fragile Watermark    Watermark region SHA-256 matches
# ✓ PASS  Timestamp            Timestamp valid — NTP-synchronized
#
# ✅  VERDICT: VALID
```

---

## Running Tests

```bash
cd backend
npm install           # installs jest
npm test              # runs all unit tests

# Expected: 26 tests passing
# merkle.test.js   — 10 tests
# crypto.test.js   — 5 tests
# watermark.test.js — 8 tests
```

---

## Running Locally

```bash
# Backend (Terminal 1)
cd backend
node server.js        # demo mode if MongoDB unavailable

# Frontend (Terminal 2)
cd frontend
npm run dev
```

---

## Security Assumptions

1. **Private key security** — RSA-2048 private key is stored in `backend/keys/private.pem`. In production, use HSM or AWS KMS.
2. **Watermark fragility** — The spread-spectrum watermark is fragile to ANY re-encoding. Bit-exact copies pass; any lossy conversion fails.
3. **NTP trust** — NTP is unauthenticated (no RFC 5906). For legal admissibility, use an RFC 3161 TSA (Trusted Timestamp Authority) instead.
4. **Browser fingerprint** — The fingerprint is device-correlated but not legally binding. It is supplementary evidence, not biometric proof.
5. **Demo mode** — When MongoDB is unavailable, the server runs in in-memory demo mode. Data is lost on restart.

---

*AuthentiCam v2.0 — Built for hackathon-level deepfake detection research*
