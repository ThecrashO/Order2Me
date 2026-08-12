const order2MeConfig = window.__ORDER2ME_CONFIG__;

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

console.log('Supabase Connected');
