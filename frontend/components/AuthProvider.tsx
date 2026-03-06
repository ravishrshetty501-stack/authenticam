'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
    useEffect(() => {
        loadFromStorage();
    }, [loadFromStorage]);
    return <>{children}</>;
}
