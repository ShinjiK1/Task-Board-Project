import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

export async function checkSignIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        return session.user; // Returning user, already signed in
    }
    return null; // No session, new user
}

export async function createNewAnon() {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
        throw error;
    }
    return data.user;
}