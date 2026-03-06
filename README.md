# AuthentiCam 🔐

**A secure media recording and verification platform** — Record video/audio, generate cryptographic authenticity certificates, and detect tampering.

## Features
- 🎥 **WebRTC Recording** — Browser-based recording with live SHA-256 hash
- 📜 **Digital Certificates** — RSA-2048 signed certificates with QR codes
- 🔍 **Tamper Detection** — Upload media + cert to verify authenticity instantly
- 👤 **Face ID Login** — Biometric authentication via browser camera
- ⛓️ **Chain of Custody** — Full audit trail for every access and verification
- 🖥️ **Device Fingerprinting** — Canvas + WebGL fingerprint embedded in certificates

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend
```bash
cd backend
npm install
# Edit .env to set MONGODB_URI if needed
npm run dev
```
Server starts on **http://localhost:5000**

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App opens at **http://localhost:3000**

## Project Structure
```
AuthentiCam/
├── backend/
│   ├── models/          # Mongoose schemas
│   ├── routes/          # REST API routes
│   ├── middleware/       # JWT auth, multer upload
│   ├── utils/           # SHA256, RSA sign/verify, AES
│   └── server.js
└── frontend/
    ├── app/             # Next.js app router pages
    ├── components/      # Navbar, HeroScene, AuthProvider
    └── lib/             # API client, Zustand store, fingerprint
```

## API Endpoints
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Password login |
| POST | /api/auth/face-login | Face ID login |
| POST | /api/recordings/upload | Upload + auto-certify |
| GET  | /api/recordings | List recordings |
| GET  | /api/certificates/:id | Get certificate |
| GET  | /api/certificates/:id/download | Download JSON |
| POST | /api/verify | Verify media authenticity |

## Environment Variables
### Backend (.env)
```env
MONGODB_URI=mongodb://localhost:27017/authenticam
JWT_SECRET=your_secret_key
PORT=5000
FRONTEND_URL=http://localhost:3000
```
### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Security
- SHA-256 file hashing
- RSA-2048 digital signatures
- AES-256 encryption utilities
- JWT authentication with expiry
- Device fingerprinting (canvas + WebGL)
- Chain-of-custody audit logs
