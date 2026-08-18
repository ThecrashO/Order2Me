// The publishable/anon key is intentionally browser-safe; database access is
// protected by Supabase RLS. This fallback also supports phones opening a
// development server through the computer's LAN address (for example,
// 192.168.x.x), where the Vercel /api/config function is unavailable.
const fallbackConfig = {
    supabaseUrl: 'https://rcgxjkrflcucllqqxiaf.supabase.co',
    supabasePublishableKey: 'sb_publishable_k_f0XnOKeoQEA_6RFr7G6Q_srAF07En'
};
const order2MeConfig = window.__ORDER2ME_CONFIG__ ||
    fallbackConfig;

if (!order2MeConfig?.supabaseUrl || !order2MeConfig?.supabasePublishableKey) {
    const message = window.__ORDER2ME_CONFIG_ERROR__ ||
        'Order2Me configuration is unavailable. Check the Vercel environment variables.';
    console.error(message);
    throw new Error(message);
}

const supabaseClient = supabase.createClient(
    order2MeConfig.supabaseUrl,
    order2MeConfig.supabasePublishableKey
);

// REST/Auth can use the Vercel proxy, but Realtime needs a direct WebSocket
// connection. Polling remains available when that direct route is blocked.
const realtimeSupabaseClient = supabase.createClient(
    fallbackConfig.supabaseUrl,
    order2MeConfig.supabasePublishableKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
);

async function getOrder2MeRealtimeClient() {
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session?.access_token) {
        await realtimeSupabaseClient.realtime.setAuth(data.session.access_token);
    }
    return realtimeSupabaseClient;
}

console.log('Supabase Connected');
