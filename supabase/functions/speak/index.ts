// Edge Function: speak
//
// Text-to-speech for the Mock Interview's AI interviewer. Sends a line of
// text to Deepgram's Aura neural voices and streams back an MP3, so Jordan
// sounds like a person instead of the browser's built-in robotic voice.
// Requires a signed-in user so it can't be used as a free public TTS proxy.
//
// Secrets (set via `supabase secrets set`), never exposed to the client:
//   DEEPGRAM_API_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_VOICE = "aura-2-thalia-en";
const ALLOWED_VOICES = new Set([
  "aura-2-thalia-en", "aura-2-orion-en", "aura-2-andromeda-en", "aura-2-apollo-en",
  "aura-2-helena-en", "aura-2-arcas-en", "aura-asteria-en", "aura-orion-en",
]);
const MAX_CHARS = 700;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      if (attempt === 1) return res;
    } catch (err) {
      if (attempt === 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("unreachable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { text, voice } = await req.json();
    if (typeof text !== "string" || !text.trim()) throw new Error("text is required");
    if (text.length > MAX_CHARS) throw new Error(`text is too long (max ${MAX_CHARS} characters)`);
    const model = typeof voice === "string" && ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;

    const res = await fetchWithRetry(`https://api.deepgram.com/v1/speak?model=${model}&encoding=mp3`, {
      method: "POST",
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!res.ok) throw new Error(`Deepgram TTS error ${res.status}: ${await res.text()}`);

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
