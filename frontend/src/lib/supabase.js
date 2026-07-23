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

const PLACEHOLDER_TASKS = [
    { title: 'Placeholder task one', status: 'To Do', column_order: 1 },
    { title: 'Placeholder task two', status: 'To Do', column_order: 2 },
    { title: 'Placeholder task three', status: 'In Progress', column_order: 1 },
    { title: 'Placeholder task four', status: 'In Progress', column_order: 2 },
    { title: 'Placeholder task five', status: 'In Review', column_order: 1 },
    { title: 'Placeholder task six', status: 'Done', column_order: 1 },
];

export async function createNewAnon() {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
        throw error;
    }

    //Create some dummy/placeholder tasks for new accounts to see stuff
    try {
        for (const task of PLACEHOLDER_TASKS) {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${data.session.access_token}`,
                },
                body: JSON.stringify({ ...task, user_id: data.user.id }),
            });
            if (!response.ok) {
                throw new Error(`Seeding "${task.title}" failed: ${response.status}`);
            }
        }
    } catch (seedError) {
        console.error(seedError);
    }

    return data.user;
}

export async function getTasks() {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/tasks', {
        headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
    });
    if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.status}`);
    }

    return await response.json();
}
