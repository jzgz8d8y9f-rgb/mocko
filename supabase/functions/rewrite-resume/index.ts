// Edge Function: rewrite-resume
//
// Scores how well a resume matches a specific job (before tailoring),
// then rewrites only the wording of relevant bullets/summary lines to
// speak the job's language. Never restructures or lengthens the resume:
// same one-page shape, only phrasing changes. Nothing is invented; every
// claim/number in the output must already exist in the original text.
// Purely a client-facing result, nothing written to the DB.
//
// Secrets (set via `supabase secrets set`), never exposed to the client:
//   ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      if (attempt === 1) return res;
    } catch (err) {
      if (attempt === 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("unreachable");
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`Claude response had no JSON: ${text}`);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error(`Could not parse Claude JSON: ${text}`);
  }
}

async function callClaude(prompt: string, maxTokens: number) {
  const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b: { type: string }) => b.type === "text") : null;
  if (!block || typeof block.text !== "string") throw new Error(`Claude response had no text block: ${JSON.stringify(data)}`);
  return block.text as string;
}

const REWRITE_PROMPT = (resumeText: string, jobTitle: string, company: string, jobDescription: string) => `You are tailoring a resume to a specific job. You do NOT invent experience, numbers, or claims that aren't already in the original resume text below. You only reword existing bullets/lines to use the job's language, and you never restructure, reorder, add sections, or change the resume's length. It must stay exactly as long (one page stays one page).

Job: "${jobTitle}" at "${company}"
Job description:
"""
${jobDescription.slice(0, 6000)}
"""

Original resume text:
"""
${resumeText.slice(0, 12000)}
"""

First, score how well the ORIGINAL (untailored) resume matches this specific job, 0-100, and explain why in 3 short dimensions. Then produce 2-5 specific edits: for each, quote the exact original phrase and give its tailored replacement plus a one-sentence reason. Then produce the full tailored resume text with those edits applied in place, nothing else changed.

Use simple, direct, professional language. No slang, jokes, or dramatic wording. Never use an em dash (the "—" character) anywhere in your response, including inside the tailored resume text. Use a period, comma, or colon instead.

Respond with ONLY compact, single-line valid JSON (no markdown fences, no line breaks or indentation inside the JSON, no commentary) matching this exact shape:
{
  "matchScoreBefore": <integer 0-100>,
  "matchReasons": [
    {"label": "Keyword match", "verdict": "Weak"|"Partial"|"Good", "detail": "<one sentence>"},
    {"label": "Experience framing", "verdict": "Weak"|"Partial"|"Good", "detail": "<one sentence>"},
    {"label": "Seniority and scope", "verdict": "Weak"|"Partial"|"Good", "detail": "<one sentence>"}
  ],
  "edits": [{"original": "<exact quoted original phrase>", "tailored": "<rewritten phrase>", "comment": "<why this helps for this job>"}],
  "tailoredResumeText": "<the full resume text with those edits applied, formatting/line breaks preserved as plain text>"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { resumeId, jobTitle, company, jobDescription } = await req.json();
    if (!resumeId || !jobTitle || !jobDescription) {
      throw new Error("resumeId, jobTitle, and jobDescription are required");
    }

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resume, error: resumeErr } = await supabase
      .from("resumes")
      .select("extracted_text")
      .eq("id", resumeId)
      .single();
    if (resumeErr || !resume) throw new Error(`Could not load resume: ${resumeErr?.message}`);
    if (!resume.extracted_text || resume.extracted_text.trim().length < 40) {
      throw new Error("Couldn't read text from this resume. Try re-uploading it as a text-based (not scanned-image) PDF.");
    }

    const result = extractJson(
      await callClaude(REWRITE_PROMPT(resume.extracted_text, jobTitle, company || "", jobDescription), 6000),
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
