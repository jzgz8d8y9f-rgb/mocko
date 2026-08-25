// Edge Function: grade-session
//
// On-Air Practice (mode omitted/'record'): takes a recording already
// uploaded to the private "recordings" bucket, transcribes it with
// Deepgram, grades the transcript against Mocko's rubric with Claude,
// stores the result in `sessions`, and returns it. Unchanged from
// before this file grew a second path.
//
// Mock Interview (mode:'voice'): takes an already-known transcript
// (captured via browser speech recognition or typed) instead of a
// recording, skips Deepgram, optionally factors difficulty/response-
// length into the grading prompt, and stores the result in
// `session_questions` (one row per question) instead of `sessions`.
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

// Retries once on network errors or 5xx responses -- upstream APIs
// occasionally have transient hiccups, and a single retry is cheap
// insurance against a session failing for no reason the user caused.
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
  const res = await fetchWithRetry(
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

// Buckets response length by question type, per the spec's thresholds.
// Returns null when duration is unknown -- the grading prompt simply
// omits any response-length guidance in that case.
function responseLengthBucket(questionType: string | undefined, durationSec: number | undefined | null): string | null {
  if (durationSec == null) return null;
  const isTechnical = questionType === "technical";
  const under = isTechnical ? 15 : 20;
  const over = isTechnical ? 120 : 150;
  if (durationSec < under) return "underdeveloped (too short for the depth this question calls for)";
  if (durationSec > over) return "unfocused (ran long -- likely padded or rambling)";
  return "an ideal length for this question";
}

async function gradeWithClaude(
  question: string,
  transcript: string,
  difficulty?: string,
  questionType?: string,
  durationSec?: number | null,
) {
  let prompt = `You are grading a mock interview answer for a finance-track interview prep app called Mocko. Grade the following transcript against this rubric, and respond with ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:

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
- delivery_pace (20 pts): Judged from the transcript's phrasing/flow only (not audio) -- does it read like a well-paced, deliberate answer rather than a rushed or padded one?
- confidence_tone (10 pts): Does the language read as confident and direct, vs. hedging/uncertain?

Question asked: "${question}"

Transcript: "${transcript}"`;

  if (difficulty) {
    prompt += `\n\nThis question was asked at "${difficulty}" difficulty -- grade the depth of answer expected accordingly. Don't hold an Easy-tier answer to Hard-tier standards, and don't let a Hard-tier answer coast on Easy-tier depth.`;
  }
  const lengthNote = responseLengthBucket(questionType, durationSec);
  if (lengthNote) {
    prompt += `\n\nThe answer's spoken length was ${lengthNote}. Factor this into communication_clarity/content_structure -- don't add a separate score for it.`;
  }

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
  const jsonText = text.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`Could not parse Claude JSON: ${jsonText}`);
  }
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
    const {
      recordingPath, transcript: providedTranscript, question, track, format, length,
      difficulty, durationSec, mode,
      sessionId, questionIndex, questionId, questionType, source,
      note, followUpAsked, followUpTranscript,
    } = await req.json();

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

    let transcript: string;
    let wpm: number | null;
    let avgPause: number | null;

    if (recordingPath) {
      const { data: signedUrlData, error: signErr } = await supabase.storage
        .from("recordings")
        .createSignedUrl(recordingPath, 60 * 10);
      if (signErr || !signedUrlData) {
        throw new Error(`Could not sign recording URL: ${signErr?.message}`);
      }
      const transcribed = await transcribe(signedUrlData.signedUrl);
      transcript = transcribed.transcript;
      const paced = computePaceAndPauses(transcribed.words);
      wpm = paced.wpm;
      avgPause = paced.avgPause;
    } else {
      transcript = providedTranscript ?? "";
      const words = transcript.trim().split(/\s+/).filter(Boolean).length;
      wpm = durationSec ? Math.round((words / durationSec) * 60) : null;
      avgPause = null;
    }

    const fillerCount = countFillers(transcript);
    const grades = await gradeWithClaude(question, transcript, difficulty, questionType, durationSec);

    const overallScore =
      grades.content_structure + grades.communication_clarity +
      grades.delivery_pace + grades.confidence_tone;

    const categoryScores = {
      content_structure: { score: grades.content_structure, max: 40 },
      communication_clarity: { score: grades.communication_clarity, max: 30 },
      delivery_pace: { score: grades.delivery_pace, max: 20 },
      confidence_tone: { score: grades.confidence_tone, max: 10 },
    };

    if (mode === "voice") {
      const { data: row, error: insertErr } = await supabase
        .from("session_questions")
        .insert({
          session_id: sessionId,
          user_id: userData.user.id,
          question_index: questionIndex,
          question_id: questionId ?? null,
          question_text: question,
          question_type: questionType ?? "behavioral",
          difficulty: difficulty ?? "medium",
          source: source ?? "guide",
          transcript,
          duration_sec: durationSec ?? null,
          follow_up_asked: !!followUpAsked,
          follow_up_transcript: followUpTranscript ?? null,
          note: note ?? null,
          category_scores: categoryScores,
          mini_score: overallScore,
          pointers_good: grades.pointers_good,
          pointers_work: grades.pointers_work,
        })
        .select()
        .single();
      if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

      return new Response(JSON.stringify(row), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
