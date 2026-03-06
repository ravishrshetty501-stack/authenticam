'use client';
import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';

const HeroScene = lazy(() => import('@/components/HeroScene'));

const FEATURES = [
  {
    icon: '🔐',
    title: 'Cryptographic Hashing',
    desc: 'SHA-256 hash generated automatically at record time. Any modification is instantly detectable.',
  },
  {
    icon: '📜',
    title: 'Digital Certificates',
    desc: 'RSA-signed authenticity certificate with timestamp, device fingerprint, and chain-of-custody.',
  },
  {
    icon: '🎥',
    title: 'Live Recording',
    desc: 'Record directly from your browser using WebRTC. Multi-format support for video and audio.',
  },
  {
    icon: '✅',
    title: 'Tamper Detection',
    desc: 'Upload any media + certificate to instantly verify if it has been modified since creation.',
  },
  {
    icon: '🧬',
    title: 'Face ID Login',
    desc: 'Biometric authentication using your device camera and face recognition for secure access.',
  },
  {
    icon: '🔗',
    title: 'Chain of Custody',
    desc: 'Complete audit trail of every access, verification, and transfer event for legal admissibility.',
  },
];

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div>
      {/* Hero Section */}
      <section style={{
        position: 'relative',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}>
        {/* 3D Scene */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%', zIndex: 0 }}>
          <Suspense fallback={<div style={{ width: '100%', height: '100%', background: 'var(--primary-bg)' }} />}>
            <HeroScene />
          </Suspense>
        </div>

        {/* Hero text */}
        <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ maxWidth: 580 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'var(--primary-bg)', border: '1px solid rgba(79,70,229,0.2)',
                borderRadius: 'var(--radius-full)', padding: '6px 16px',
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)',
                marginBottom: '1.5rem',
              }}
            >
              <div className="pulse-dot" />
              Trusted Media Authentication Platform
            </motion.div>

            <h1 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: '1.5rem',
            }}>
              Prove Your Media is{' '}
              <span className="text-gradient">100% Authentic</span>
            </h1>

            <p style={{
              fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.7,
              maxWidth: 460, marginBottom: '2.5rem',
            }}>
              Record, certify, and verify media authenticity with cryptographic precision.
              Detect tampering instantly. Build an unbreakable chain of evidence.
            </p>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {isAuthenticated ? (
                <>
                  <Link href="/record">
                    <button className="btn btn-primary btn-lg">
                      <span>🎥</span> Start Recording
                    </button>
                  </Link>
                  <Link href="/dashboard">
                    <button className="btn btn-secondary btn-lg">My Dashboard</button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/register">
                    <button className="btn btn-primary btn-lg">
                      Get Started Free →
                    </button>
                  </Link>
                  <Link href="/verify">
                    <button className="btn btn-secondary btn-lg">
                      Verify a Recording
                    </button>
                  </Link>
                </>
              )}
            </div>

            {/* Trust badges */}
            <div style={{
              display: 'flex', gap: '20px', marginTop: '3rem', flexWrap: 'wrap',
            }}>
              {[
                { icon: '🔒', label: 'AES-256 Encrypted' },
                { icon: '✍️', label: 'RSA Signed' },
                { icon: '⛓️', label: 'Chain of Custody' },
              ].map((b) => (
                <div key={b.label} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500,
                }}>
                  <span>{b.icon}</span> {b.label}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{
        padding: '6rem 0',
        background: 'white',
        borderTop: '1px solid var(--border)',
        position: 'relative', zIndex: 1,
      }}>
        <div className="page-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{ textAlign: 'center', marginBottom: '4rem' }}
          >
            <h2 className="section-title">Everything you need to prove authenticity</h2>
            <p className="section-subtitle">Enterprise-grade security in a seamless browser experience</p>
          </motion.div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="card"
                style={{ padding: '2rem' }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'var(--primary-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', marginBottom: '1rem',
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '5rem 0',
        background: 'linear-gradient(135deg, var(--primary) 0%, #3730a3 100%)',
        position: 'relative', zIndex: 1,
        textAlign: 'center',
      }}>
        <div className="page-container">
          <h2 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '2.5rem', fontWeight: 800, color: 'white',
            letterSpacing: '-0.03em', marginBottom: '1rem',
          }}>
            Start verifying your media today
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500, marginBottom: '2.5rem' }}>
            Free to use. No credit card required.
          </p>
          <Link href="/auth/register">
            <button className="btn btn-lg" style={{
              background: 'white', color: 'var(--primary)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            }}>
              Create your account →
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
}
