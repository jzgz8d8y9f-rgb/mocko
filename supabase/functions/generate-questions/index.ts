// Edge Function: generate-questions
//
// Given a resume's extracted text plus industry/difficulty, asks Claude
// for N behavioral questions grounded in the resume's actual roles and
// experience. Nothing is written to the DB -- the questions are used
// immediately by the client for that one session.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { resumeText, industry, difficulty, count } = await req.json();
    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 20) {
      throw new Error("Resume text is missing or too short to generate tailored questions from.");
    }

    const n = Math.min(Math.max(Number(count) || 1, 1), 8);
    const prompt = `You are generating behavioral interview questions for a candidate practicing for ${industry || "finance"} interviews, at a "${difficulty || "medium"}" difficulty level.

Read the resume below and write exactly ${n} behavioral interview question(s) that reference SPECIFIC roles, projects, or experiences from this resume by name (e.g. "At [Company], you mentioned X -- tell me about a time..."). Do not ask generic questions that could apply to anyone; each question must clearly be about something on this resume.

Difficulty guide: "easy" = straightforward, warm-up style; "medium" = standard STAR-format behavioral questions about a specific past experience; "hard" = pointed, tougher self-critical questions about a specific past experience (e.g. a project that didn't go well, a hard tradeoff they made).

Respond with ONLY a JSON array of ${n} question string(s), no markdown fences, no commentary. Example shape: ["question one", "question two"]

Resume:
"""
${resumeText.slice(0, 12000)}
"""`;

    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const text = data.content[0].text as string;
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new Error(`Claude response had no JSON array: ${text}`);
    }
    let questions: string[];
    try {
      questions = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error(`Could not parse Claude JSON: ${text}`);
    }

    return new Response(JSON.stringify({ questions }), {
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
