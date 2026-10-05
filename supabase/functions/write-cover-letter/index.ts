// Edge Function: write-cover-letter
//
// Writes a cover letter from a resume's actual content plus job info and
// optional extra context the user wants included, at a target word count.
// Stores the result in `cover_letters` and returns it.
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

const WORD_TARGETS: Record<string, number> = { short: 150, recommended: 250, long: 350 };

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
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b: { type: string }) => b.type === "text") : null;
  if (!block || typeof block.text !== "string") throw new Error(`Claude response had no text block: ${JSON.stringify(data)}`);
  return block.text.trim();
}

const LETTER_PROMPT = (
  resumeText: string, jobTitle: string, company: string, jobDescription: string,
  additionalInfo: string, targetWords: number,
) => `Write a cover letter for this job application, built only from real content in the resume below. Do not invent experience, employers, or numbers that aren't in the resume.

Job: "${jobTitle}" at "${company}"
Job description:
"""
${jobDescription.slice(0, 6000)}
"""

Resume:
"""
${resumeText.slice(0, 12000)}
"""
${additionalInfo ? `\nAdditional context the applicant wants included: "${additionalInfo}"\n` : ""}
Target length: approximately ${targetWords} words. Professional tone, no cliches like "I am writing to express my interest", get to something concrete in the first sentence. Use simple, direct, professional language. No slang, jokes, or dramatic wording. Never use an em dash (the "—" character) anywhere in the letter. Use a period, comma, or colon instead.

Respond with ONLY the letter text itself (starting with "Dear ..." and ending with a signoff and the applicant's name from the resume). No markdown, no commentary, no JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { resumeId, jobTitle, company, jobDescription, additionalInfo, wordLength } = await req.json();
    if (!resumeId || !jobTitle || !jobDescription) {
      throw new Error("resumeId, jobTitle, and jobDescription are required");
    }
    const targetWords = WORD_TARGETS[wordLength] || WORD_TARGETS.recommended;

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

    const letterText = await callClaude(
      LETTER_PROMPT(resume.extracted_text, jobTitle, company || "", jobDescription, additionalInfo || "", targetWords),
      2000,
    );

    const { data: letter, error: insertErr } = await supabase
      .from("cover_letters")
      .insert({
        user_id: userData.user.id,
        resume_id: resumeId,
        job_title: jobTitle,
        company: company || "",
        job_description: jobDescription,
        additional_info: additionalInfo || null,
        word_length: wordLength && WORD_TARGETS[wordLength] ? wordLength : "recommended",
        letter_text: letterText,
      })
      .select()
      .single();
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(JSON.stringify(letter), {
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
