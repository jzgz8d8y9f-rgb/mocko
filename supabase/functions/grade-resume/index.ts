// Edge Function: grade-resume
//
// Grades a resume already uploaded to the "resumes" table/bucket (its
// text already extracted client-side by pdf.js, see js/resume.js).
// One Claude call, graded section-by-section (only sections the resume
// actually has -- weights are redistributed to still sum to 100),
// harshly on purpose, with quoted-and-explained flags rather than
// vague feedback. Stores the result in `resume_reviews` and returns it.
//
// Secrets (set via `supabase secrets set`), never exposed to the client:
//   ANTHROPIC_API_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
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

const GRADE_PROMPT = (resumeText: string) => `You are a blunt, harsh resume critic for a career-prep app. Grade the resume below the way an unimpressed recruiter doing a 6-second scan would, not the way a supportive career coach would. Real, standard resume rules to grade against:

- One page is expected for someone applying to a new role.
- No objective statement and no summary/profile section are needed or expected. A resume is its own summary. Do NOT suggest adding one, and do NOT grade a "Summary" or "Objective" section even if present, just ignore it entirely, positively or negatively.
- GPA and coursework are optional filler once there is real experience to lead with. Do not treat their absence as a flaw, and note if they're taking up space that could go to something stronger.
- No high school listed once there is education beyond it.
- Paid work experience and unpaid school/club leadership belong in SEPARATE sections ("Experience" vs "Leadership & Activities"). If they're mixed together in one section, flag it specifically.
- Bullets should be past tense, accomplishment-focused, quantified with real numbers wherever possible, and must not read like a copy-pasted job description.
- No references on a resume.
- Formatting (dates, punctuation, tense) must be internally consistent.
- Experience within each section should be in reverse chronological order.

Grade ONLY the sections this resume actually has (e.g. if there's no "Skills" section, do not invent a Skills category). Weight the categories you do grade so they sum to exactly 100. Assign each a harsh letter grade (F through A; do not grade generously) and a specific, critical one-sentence comment.

Flags: find 4 to 7 specific, concrete problems. Each flag must quote a short exact phrase from the resume text below (verbatim, a few words) and explain harshly but usefully what's wrong with it.

Never use an em dash (the "—" character) anywhere in your response. Use a period, comma, or colon instead.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "overallScore": <integer 0-100, the weighted sum of your category scores>,
  "categories": [{"name": "<section name>", "weight": <integer, all weights sum to 100>, "score": <integer 0 to weight>, "grade": "<letter grade>", "comment": "<one harsh, specific sentence>"}],
  "flags": [{"quote": "<short exact phrase from the resume>", "comment": "<harsh, specific explanation>"}],
  "goodPoints": [<1-3 short strings, only genuinely earned praise, it's fine if this list is short>],
  "suggestions": [<3-5 short, imperative, actionable strings, concrete next steps>]
}

Resume text:
"""
${resumeText.slice(0, 12000)}
"""`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { resumeId } = await req.json();
    if (!resumeId) throw new Error("resumeId is required");

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
      .select("extracted_text, label")
      .eq("id", resumeId)
      .single();
    if (resumeErr || !resume) throw new Error(`Could not load resume: ${resumeErr?.message}`);
    if (!resume.extracted_text || resume.extracted_text.trim().length < 40) {
      throw new Error("Couldn't read text from this resume. Try re-uploading it as a text-based (not scanned-image) PDF.");
    }

    const graded = extractJson(await callClaude(GRADE_PROMPT(resume.extracted_text), 3000));

    const { data: review, error: insertErr } = await supabase
      .from("resume_reviews")
      .insert({
        user_id: userData.user.id,
        resume_id: resumeId,
        overall_score: graded.overallScore,
        categories: graded.categories,
        flags: graded.flags,
        good_points: graded.goodPoints,
        suggestions: graded.suggestions,
      })
      .select()
      .single();
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(JSON.stringify(review), {
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
