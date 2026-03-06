'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, user, clearAuth } = useAuthStore();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleLogout = () => {
        clearAuth();
        toast.success('Logged out successfully');
        router.push('/');
        setMenuOpen(false);
    };

    const navLinks = isAuthenticated
        ? [
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/record', label: 'Record' },
            { href: '/verify', label: 'Verify' },
        ]
        : [
            { href: '/verify', label: 'Verify' },
        ];

    return (
        <nav style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            height: 'var(--nav-height)', zIndex: 1000,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 2px 20px rgba(0,0,0,0.05)',
        }}>
            <div className="page-container" style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                {/* Logo */}
                <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(79,70,229,0.35)', flexShrink: 0,
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                    </div>
                    <span style={{
                        fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#0f172a',
                        letterSpacing: '-0.02em',
                    }}>
                        Authenti<span style={{ color: 'var(--primary)' }}>Cam</span>
                    </span>
                </Link>

                {/* Desktop nav links */}
                <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        {navLinks.map((link) => (
                            <Link key={link.href} href={link.href} style={{
                                textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500,
                                color: pathname === link.href ? 'var(--primary)' : 'var(--text-secondary)',
                                transition: 'color 0.2s', position: 'relative',
                            }}>
                                {link.label}
                                {pathname === link.href && (
                                    <motion.div layoutId="navbar-indicator" style={{
                                        position: 'absolute', bottom: -4, left: 0, right: 0,
                                        height: 2, background: 'var(--primary)', borderRadius: 2,
                                    }} />
                                )}
                            </Link>
                        ))}
                    </div>

                    {isAuthenticated ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 12px', borderRadius: 'var(--radius-full)',
                                background: 'var(--primary-bg)', border: '1px solid rgba(79,70,229,0.15)',
                            }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700, color: 'white',
                                }}>
                                    {user?.username?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                                    {user?.username}
                                </span>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Log out</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Link href="/auth/login"><button className="btn btn-secondary btn-sm">Login</button></Link>
                            <Link href="/auth/register"><button className="btn btn-primary btn-sm">Get Started</button></Link>
                        </div>
                    )}
                </div>

                {/* Mobile hamburger button */}
                <button
                    className="nav-hamburger"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Toggle menu"
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '8px', display: 'flex', flexDirection: 'column',
                        gap: '5px', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <span style={{
                        display: 'block', width: 22, height: 2, borderRadius: 2,
                        background: menuOpen ? 'transparent' : 'var(--text-primary)',
                        transition: 'all 0.25s',
                        transform: menuOpen ? 'rotate(45deg) translate(5px, 7px)' : 'none',
                    }} />
                    <span style={{
                        display: 'block', width: 22, height: 2, borderRadius: 2,
                        background: 'var(--text-primary)', transition: 'all 0.25s',
                        opacity: menuOpen ? 0 : 1,
                    }} />
                    <span style={{
                        display: 'block', width: 22, height: 2, borderRadius: 2,
                        background: menuOpen ? 'transparent' : 'var(--text-primary)',
                        transition: 'all 0.25s',
                        transform: menuOpen ? 'rotate(-45deg) translate(5px, -7px)' : 'none',
                    }} />
                </button>
            </div>

            {/* Mobile dropdown menu */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.18 }}
                        style={{
                            position: 'absolute', top: 'var(--nav-height)', left: 0, right: 0,
                            background: 'rgba(255,255,255,0.98)',
                            backdropFilter: 'blur(20px)',
                            borderBottom: '1px solid rgba(0,0,0,0.08)',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                            padding: '1rem 1.5rem',
                            display: 'flex', flexDirection: 'column', gap: '0.25rem',
                            zIndex: 999,
                        }}
                    >
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMenuOpen(false)}
                                style={{
                                    textDecoration: 'none', fontSize: '1rem', fontWeight: 600,
                                    color: pathname === link.href ? 'var(--primary)' : 'var(--text-primary)',
                                    padding: '0.75rem 0.5rem',
                                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                                    display: 'block',
                                }}
                            >
                                {link.label}
                            </Link>
                        ))}

                        <div style={{ paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {isAuthenticated ? (
                                <>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '0.5rem', borderRadius: 'var(--radius-md)',
                                        background: 'var(--primary-bg)',
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.85rem', fontWeight: 700, color: 'white', flexShrink: 0,
                                        }}>
                                            {user?.username?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}>{user?.username}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                                        </div>
                                    </div>
                                    <button className="btn btn-secondary" onClick={handleLogout} style={{ justifyContent: 'center' }}>Log out</button>
                                </>
                            ) : (
                                <>
                                    <Link href="/auth/login" onClick={() => setMenuOpen(false)}>
                                        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Login</button>
                                    </Link>
                                    <Link href="/auth/register" onClick={() => setMenuOpen(false)}>
                                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Get Started Free</button>
                                    </Link>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
