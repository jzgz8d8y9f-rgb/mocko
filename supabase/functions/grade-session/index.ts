// Edge Function: grade-session
//
// Takes a recording already uploaded to the private "recordings" bucket,
// transcribes it with Deepgram, grades the transcript against Mocko's
// rubric with Claude, stores the result in `sessions`, and returns it.
//
// Secrets (set via `supabase secrets set`), never exposed to the client:
//   DEEPGRAM_API_KEY, ANTHROPIC_API_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const FILLER_PATTERNS = [
  "um", "uh", "like", "kind of", "sort of", "you know",
  "basically", "actually", "literally", "i guess",
];

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
}

function countFillers(transcript: string): number {
  const lower = transcript.toLowerCase();
  return FILLER_PATTERNS.reduce((count, phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(`\\b${escaped}\\b`, "g"));
    return count + (matches ? matches.length : 0);
  }, 0);
}

function computePaceAndPauses(words: DeepgramWord[]) {
  if (words.length === 0) return { wpm: 0, avgPause: 0 };
  const durationSec = words[words.length - 1].end - words[0].start;
  const wpm = durationSec > 0 ? Math.round((words.length / durationSec) * 60) : 0;

  const pauses: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0) pauses.push(gap);
  }
  const avgPause = pauses.length
    ? Math.round((pauses.reduce((a, b) => a + b, 0) / pauses.length) * 10) / 10
    : 0;

  return { wpm, avgPause };
}

async function transcribe(signedUrl: string) {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&model=nova-2",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: signedUrl }),
    },
  );
  if (!res.ok) {
    throw new Error(`Deepgram error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const alt = data.results.channels[0].alternatives[0];
  return {
    transcript: alt.transcript as string,
    words: (alt.words ?? []) as DeepgramWord[],
  };
}

async function gradeWithClaude(question: string, transcript: string) {
  const prompt = `You are grading a mock interview answer for a finance-track interview prep app called Mocko. Grade the following transcript against this rubric, and respond with ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:

{
  "content_structure": <integer 0-40>,
  "communication_clarity": <integer 0-30>,
  "delivery_pace": <integer 0-20>,
  "confidence_tone": <integer 0-10>,
  "pointers_good": [<2-3 short strings, specific to this answer>],
  "pointers_work": [<2-3 short strings, specific to this answer, actionable>]
}

Rubric categories:
- content_structure (40 pts): Is there a clear STAR structure (Situation, Task, Action, Result)? Is the answer relevant to the question?
- communication_clarity (30 pts): Is the answer clear, concise, and easy to follow? Free of rambling or vague language?
- delivery_pace (20 pts): Judged from the transcript's phrasing/flow only (not audio) — does it read like a well-paced, deliberate answer rather than a rushed or padded one?
- confidence_tone (10 pts): Does the language read as confident and direct, vs. hedging/uncertain?

Question asked: "${question}"

Transcript: "${transcript}"`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  const jsonText = text.trim().replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(jsonText);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { recordingPath, question, track, format, length } = await req.json();

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

    const { data: signedUrlData, error: signErr } = await supabase.storage
      .from("recordings")
      .createSignedUrl(recordingPath, 60 * 10);
    if (signErr || !signedUrlData) {
      throw new Error(`Could not sign recording URL: ${signErr?.message}`);
    }

    const { transcript, words } = await transcribe(signedUrlData.signedUrl);
    const { wpm, avgPause } = computePaceAndPauses(words);
    const fillerCount = countFillers(transcript);
    const grades = await gradeWithClaude(question, transcript);

    const overallScore =
      grades.content_structure + grades.communication_clarity +
      grades.delivery_pace + grades.confidence_tone;

    const categoryScores = {
      content_structure: { score: grades.content_structure, max: 40 },
      communication_clarity: { score: grades.communication_clarity, max: 30 },
      delivery_pace: { score: grades.delivery_pace, max: 20 },
      confidence_tone: { score: grades.confidence_tone, max: 10 },
    };

    const { data: session, error: insertErr } = await supabase
      .from("sessions")
      .insert({
        user_id: userData.user.id,
        track: track ?? "Finance",
        format,
        length,
        question_text: question,
        transcript,
        wpm,
        filler_count: fillerCount,
        avg_pause_length: avgPause,
        overall_score: overallScore,
        category_scores: categoryScores,
        pointers_good: grades.pointers_good,
        pointers_work: grades.pointers_work,
        recording_path: recordingPath,
      })
      .select()
      .single();
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(JSON.stringify(session), {
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
