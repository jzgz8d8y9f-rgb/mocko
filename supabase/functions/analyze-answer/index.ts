// Edge Function: analyze-answer
//
// One Claude call, run once per Mock Interview answer, that does three
// things at once (to avoid a second round-trip per answer):
//   1. Decides whether a follow-up probe is warranted.
//   2. Writes a short interviewer's note for the results screen.
//   3. Rolls the answer into a one-sentence summary for continuity, and
//      (Full Interview only) a soft transition line into the next
//      question, built from prior summaries.
//
// Nothing is written to the DB here -- purely a judgment call, used
// immediately by the client's conversation state machine.
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
    const {
      questionText, questionType, difficulty, transcript,
      priorSummaries, nextQuestionText,
    } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      throw new Error("transcript is required");
    }

    const wantsTransition = Array.isArray(priorSummaries) && priorSummaries.length > 0 && !!nextQuestionText;

    const prompt = `You are an AI mock interviewer for a finance-track interview prep app called Mocko, reviewing one answer in real time during a live interview.

Question asked (${questionType || "behavioral"}, "${difficulty || "medium"}" difficulty): "${questionText}"

Candidate's answer transcript: "${transcript}"

Respond with ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "needsFollowUp": <boolean -- true if the answer is vague, generic, missing a concrete result/outcome, or clearly underdeveloped for a "${difficulty || "medium"}"-difficulty question>,
  "reason": <one short phrase explaining the needsFollowUp call>,
  "note": <one short sentence, an interviewer's private note on this answer, e.g. "Good specificity, light on outcome/result">,
  "summarySentence": <one short sentence summarizing what this answer was about, for later reference>${wantsTransition ? ',\n  "transitionLine": <OPTIONAL: a short, natural bridging sentence that references an earlier answer before moving to the next question, ONLY if it flows naturally -- otherwise null>' : ""}
}
${wantsTransition ? `\nPrior answer summaries this session, in order: ${JSON.stringify(priorSummaries)}\nNext question to ask: "${nextQuestionText}"\nOnly write a transitionLine if referencing a prior answer would feel natural here -- it's fine and expected to return null often.` : ""}`;

    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 512,
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
    const text = block.text as string;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error(`Claude response had no JSON object: ${text}`);
    }
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error(`Could not parse Claude JSON: ${text}`);
    }
    if (!("transitionLine" in result)) result.transitionLine = null;

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
