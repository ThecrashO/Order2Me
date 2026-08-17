const localDevelopmentConfig = {
    supabaseUrl: 'https://rcgxjkrflcucllqqxiaf.supabase.co',
    supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZ3hqa3JmbGN1Y2xscXF4aWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzM4MzIsImV4cCI6MjEwMDM0OTgzMn0.menNwNRIWhdwdvI-RAKEH_r16KG954tjhk27J99anqA'
};
const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const order2MeConfig = window.__ORDER2ME_CONFIG__ ||
    (isLocalDevelopment ? localDevelopmentConfig : null);

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
