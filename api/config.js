module.exports = function handler(request, response) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabasePublishableKey =
        process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

    response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store, max-age=0');

    if (!supabaseUrl || !supabasePublishableKey) {
        response.status(500).send(
            'window.__ORDER2ME_CONFIG_ERROR__ = "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.";'
        );
        return;
    }

    response.status(200).send(
        `window.__ORDER2ME_CONFIG__ = ${JSON.stringify({
            supabaseUrl,
            supabasePublishableKey
        })};`
    );
};
