module.exports = function handler(request, response) {
    const upstreamSupabaseUrl = process.env.SUPABASE_URL;
    const supabasePublishableKey =
        process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

    response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store, max-age=0');

    if (!upstreamSupabaseUrl || !supabasePublishableKey) {
        response.status(500).send(
            'window.__ORDER2ME_CONFIG_ERROR__ = "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.";'
        );
        return;
    }

    // Keep browser traffic on the app's reachable domain. Vercel rewrites
    // /supabase/* to the managed Supabase project, which avoids client-side
    // DNS/routing failures for networks that cannot reach *.supabase.co.
    const forwardedProto = request.headers['x-forwarded-proto'];
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const protocol = forwardedProto || (host?.startsWith('localhost') ? 'http' : 'https');
    const supabaseUrl = host
        ? `${protocol}://${host}/supabase`
        : upstreamSupabaseUrl;

    response.status(200).send(
        `window.__ORDER2ME_CONFIG__ = ${JSON.stringify({
            supabaseUrl,
            supabasePublishableKey
        })};`
    );
};
