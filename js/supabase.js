const SUPABASE_URL = "https://rcgxjkrflcucllqqxiaf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZ3hqa3JmbGN1Y2xscXF4aWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzM4MzIsImV4cCI6MjEwMDM0OTgzMn0.menNwNRIWhdwdvI-RAKEH_r16KG954tjhk27J99anqA";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("Supabase Connected");