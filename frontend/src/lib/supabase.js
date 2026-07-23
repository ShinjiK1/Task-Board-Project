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
            await createTask({...task, user_id: data.user.id})
        }
    } catch (seedError) {
        console.error(seedError);
    }

    return data.user;
}

async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function getTasks() {
    const response = await fetch('/api/tasks', {
        headers: await authHeaders()
    });
    if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.status}`);
    }

    return await response.json();
}

export async function createTask(task) {
    const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(task),
    });
    if (!response.ok) {
        throw new Error(`Creating task failed: ${response.status}`);
    }
    return await response.json();
}

// move: { column, targetId, position } — insert before/after targetId in column,
// or append to the end of column when targetId is null
export async function moveTask(id, move) {
    const response = await fetch(`/api/tasks/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(move),
    });
    if (!response.ok) {
        throw new Error(`Moving task failed: ${response.status}`);
    }
}

export async function deleteTask(id) {
    const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: await authHeaders()
    });
    if (!response.ok) {
        throw new Error(`Deleting task failed: ${response.status}`);
    }
}