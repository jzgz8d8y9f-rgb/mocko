// Edge Function: tailor-resume-questions
//
// Two Claude calls in one HTTP round trip:
//   1. Extraction -- pull 3-5 anchor points (role/project/skill) out of
//      the resume text.
//   2. Generation -- write one tailored question per anchor.
//
// Kept separate from generate-questions (used by On-Air Practice)
// because the response shape here is anchor-tagged objects, not a bare
// string array, and On-Air's existing contract must not change.
// Nothing is written to the DB -- used immediately by the client.
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
  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b: { type: string }) => b.type === "text") : null;
  if (!block || typeof block.text !== "string") {
    throw new Error(`Claude response had no text block: ${JSON.stringify(data)}`);
  }
  return block.text as string;
}

function extractJson(text: string, openChar: string, closeChar: string) {
  const start = text.indexOf(openChar);
  const end = text.lastIndexOf(closeChar);
  if (start === -1 || end === -1) {
    throw new Error(`Claude response had no JSON: ${text}`);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error(`Could not parse Claude JSON: ${text}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { resumeText, difficulty, industry } = await req.json();
    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 20) {
      throw new Error("Resume text is missing or too short.");
    }

    const text = resumeText.slice(0, 12000);

    const extractPrompt = `Read this resume and pull out 3-5 "anchor points" -- specific roles, projects, or skills a mock interviewer could ask a follow-up question about. Respond with ONLY a JSON array (no markdown fences, no commentary) of objects shaped like:
[{"type": "role"|"project"|"skill", "detail": "<short specific description, e.g. 'Financial Analyst at Acme Corp' or 'Led a trading model rebuild'>"}]

Resume:
"""
${text}
"""`;
    const extractText = await callClaude(extractPrompt, 512);
    const anchors = extractJson(extractText, "[", "]") as Array<{ type: string; detail: string }>;
    if (!Array.isArray(anchors) || anchors.length === 0) {
      throw new Error("Could not extract any anchors from this resume.");
    }

    const generatePrompt = `You are generating behavioral interview questions for a candidate practicing for ${industry || "finance"} interviews, at a "${difficulty || "medium"}" difficulty level.

For EACH of these resume anchor points, write one behavioral interview question that references it specifically by name:
${anchors.map((a, i) => `${i + 1}. (${a.type}) ${a.detail}`).join("\n")}

Difficulty guide: "easy" = straightforward, warm-up style; "medium" = standard STAR-format behavioral questions about this specific experience; "hard" = pointed, tougher self-critical questions about this specific experience.

Respond with ONLY a JSON array (no markdown fences, no commentary) of exactly ${anchors.length} question string(s), in the same order as the anchor list above. Example shape: ["question one", "question two"]`;
    const generateText = await callClaude(generatePrompt, 1024);
    const questionTexts = extractJson(generateText, "[", "]") as string[];

    const questions = anchors.map((a, i) => ({
      text: questionTexts[i] || `Tell me more about ${a.detail}.`,
      anchorType: a.type,
      anchorDetail: a.detail,
    }));

    return new Response(JSON.stringify({ anchors, questions }), {
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
