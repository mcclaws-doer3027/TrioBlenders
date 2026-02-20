import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserRole = 'citizen' | 'police';

interface Profile {
    id: string;
    role: UserRole;
    full_name: string | null;
    push_token: string | null;
}

interface AuthContextType {
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    profile: null,
    loading: true,
    signIn: async () => ({ error: null }),
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

function useProtectedRoute(session: Session | null, profile: Profile | null, loading: boolean) {
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;

        const inAuthGroup = segments[0] === '(auth)';
        const inCitizenGroup = segments[0] === '(citizen)';
        const inPoliceGroup = segments[0] === '(police)';

        if (!session && !inAuthGroup) {
            router.replace('/(auth)/login');
        } else if (session && profile) {
            if (profile.role === 'citizen' && !inCitizenGroup) {
                router.replace('/(citizen)/sos');
            } else if (profile.role === 'police' && !inPoliceGroup) {
                router.replace('/(police)/alerts');
            }
        }
    }, [session, profile, loading, segments]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, role, full_name, push_token')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data as Profile;
    };

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setSession(session);
            if (session?.user) {
                const p = await fetchProfile(session.user.id);
                setProfile(p);
            }
            setLoading(false);
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
                const p = await fetchProfile(session.user.id);
                setProfile(p);
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    useProtectedRoute(session, profile, loading);

    return (
        <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
