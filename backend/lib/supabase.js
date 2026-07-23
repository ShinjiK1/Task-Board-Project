const {createClient} = require("@supabase/supabase-js");

// Supabase client for the user, makes calls as the user account (based on the JWT
// passed by the user in authorization) with the same priviledges/restrictions they have
function supabaseForUser(req) {
    const headers = req.headers.authorization
        ? {Authorization: req.headers.authorization}
        : {};
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_PUBLISHABLE_KEY,
        {global: {headers}}
    );
}

module.exports = supabaseForUser;
