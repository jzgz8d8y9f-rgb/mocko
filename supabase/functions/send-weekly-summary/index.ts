// Edge Function: send-weekly-summary
//
// Sends the weekly email for every user who has notify_weekly_summary on.
// Two variants:
//   - Played this week: full breakdown -- sessions, avg score + delta vs
//     the prior week, per-category scores, drills.
//   - Didn't play: a short "hop back in" nudge instead.
// Both end in a button back to the site.
//
// Sent through Gmail SMTP (hello@mocko.net) via nodemailer, since that's
// the account already wired up as the project's sender.
//
// Trigger: POST with header X-Cron-Secret matching the CRON_SECRET secret.
// Body (all optional): { "userId": "<uuid>" } sends to just that one user,
// ignoring their notify_weekly_summary toggle -- for demos/testing only.
//
// Secrets (set via `supabase secrets set`):
//   GMAIL_APP_PASSWORD, CRON_SECRET
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const SENDER = "hello@mocko.net";
const SITE_URL = "https://mocko.net";

const GOOD = "#22C3B6", RECORD = "#E63946", WARN = "#E9A23B", BLUE = "#4C6FE7";
const BG = "#14151A", SURFACE = "#1D1F26", TEXT = "#EDEFFA", MUTED = "#9AA0C0", LINE = "#2A2C36";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const CATEGORY_LABELS: Record<string, [string, string]> = {
  content_structure: ["Content & Structure", GOOD],
  communication_clarity: ["Communication Clarity", BLUE],
  delivery_pace: ["Delivery & Pace", WARN],
  confidence_tone: ["Confidence & Tone", RECORD],
};

function bar(score: number, max: number, color: string): string {
  const pct = max ? Math.max(2, Math.round((score / max) * 100)) : 2;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:6px;background:${LINE};border-radius:3px;overflow:hidden;"><tr><td style="width:${pct}%;background:${color};height:6px;border-radius:3px;"></td><td></td></tr></table>`;
}

function wrapEmail(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:28px;"><span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:${TEXT};letter-spacing:0.02em;">MOCKO</span></td></tr>
<tr><td style="background:${SURFACE};border:1px solid ${LINE};border-radius:14px;padding:32px;">
${bodyHtml}
</td></tr>
<tr><td align="center" style="padding-top:22px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.6;">You&rsquo;re getting this because notifications are on for your Mocko account.<br>Manage this in Settings &middot; Notifications on <a href="${SITE_URL}" style="color:${MUTED};">mocko.net</a>.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function ctaButton(label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${SITE_URL}" style="display:inline-block;background:${GOOD};color:#08211d;font-family:Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:9px;">${esc(label)} &rarr;</a></td></tr></table>`;
}

interface SessionRow { created_at: string; mode: string | null; difficulty: string | null; overall_score: number | null; category_scores: Record<string, { score: number; max: number }> | null; }
interface DrillRow { drill_key: string; score: number; }

function buildBreakdownEmail(name: string, sessions: SessionRow[], prevAvg: number | null, drills: DrillRow[]) {
  const scored = sessions.filter((s) => s.overall_score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + Number(s.overall_score), 0) / scored.length) : 0;
  const delta = prevAvg != null ? avg - Math.round(prevAvg) : null;
  const deltaColor = delta == null ? MUTED : delta >= 0 ? GOOD : RECORD;
  const deltaText = delta == null ? "First graded week" : delta >= 0 ? `&uarr; ${delta} pts vs last week` : `&darr; ${Math.abs(delta)} pts vs last week`;

  const catTotals: Record<string, { score: number; max: number; n: number }> = {};
  for (const s of scored) {
    for (const [key, val] of Object.entries(s.category_scores || {})) {
      catTotals[key] ??= { score: 0, max: val.max, n: 0 };
      catTotals[key].score += val.score;
      catTotals[key].n += 1;
    }
  }
  const catRows = Object.entries(CATEGORY_LABELS).map(([key, [label, color]]) => {
    const t = catTotals[key];
    if (!t) return "";
    const avgScore = Math.round((t.score / t.n) * 10) / 10;
    return `<tr><td style="padding:10px 0 2px;font-family:Arial,sans-serif;font-size:14px;color:${TEXT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-weight:600;">${label}</td><td align="right" style="color:${MUTED};font-size:13px;">${avgScore} / ${t.max}</td></tr></table></td></tr><tr><td style="padding:0 0 10px;">${bar(avgScore, t.max, color)}</td></tr>`;
  }).join("");

  const sessionRows = sessions.map((s) => {
    const date = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const modeLabel = s.mode === "voice" ? "Mock Interview" : "On-Air Practice";
    const scoreLabel = s.overall_score != null ? `${Math.round(Number(s.overall_score))}/100` : "In progress";
    return `<tr><td style="padding:9px 0;border-bottom:1px dashed ${LINE};font-family:Arial,sans-serif;font-size:13.5px;color:${MUTED};">${date}</td><td style="padding:9px 0;border-bottom:1px dashed ${LINE};font-family:Arial,sans-serif;font-size:13.5px;color:${TEXT};">${modeLabel}${s.difficulty ? " &middot; " + esc(s.difficulty[0].toUpperCase() + s.difficulty.slice(1)) : ""}</td><td align="right" style="padding:9px 0;border-bottom:1px dashed ${LINE};font-family:Arial,sans-serif;font-size:13.5px;font-weight:700;color:${TEXT};">${scoreLabel}</td></tr>`;
  }).join("");

  const drillRows = drills.map((d) => `<tr><td style="padding:9px 0;font-family:Arial,sans-serif;font-size:13.5px;color:${TEXT};">${esc(d.drill_key)}</td><td align="right" style="padding:9px 0;font-family:Arial,sans-serif;font-size:13.5px;font-weight:700;color:${TEXT};">${d.score} pts</td></tr>`).join("");

  const body = `
<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;color:${TEXT};">Hey ${esc(name)},</p>
<p style="margin:0 0 26px;font-family:Arial,sans-serif;font-size:14px;color:${MUTED};line-height:1.6;">Here&rsquo;s how your week on Mocko went.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;"><tr>
<td align="center" style="background:${BG};border-radius:10px;padding:18px 10px;"><div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:${TEXT};">${sessions.length}</div><div style="font-family:Arial,sans-serif;font-size:11.5px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Session${sessions.length !== 1 ? "s" : ""}</div></td>
<td style="width:10px;"></td>
<td align="center" style="background:${BG};border-radius:10px;padding:18px 10px;"><div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:${TEXT};">${avg}</div><div style="font-family:Arial,sans-serif;font-size:11.5px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Avg score</div></td>
<td style="width:10px;"></td>
<td align="center" style="background:${BG};border-radius:10px;padding:18px 10px;"><div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${deltaColor};margin-top:9px;">${deltaText}</div></td>
</tr></table>
${catRows ? `<div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${TEXT};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Score breakdown</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">${catRows}</table>` : ""}
<div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${TEXT};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Sessions this week</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">${sessionRows}</table>
${drillRows ? `<div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${TEXT};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Drills this week</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">${drillRows}</table>` : `<div style="margin-bottom:14px;"></div>`}
${ctaButton("Back to Mocko")}`;

  return { subject: "Your week on Mocko", html: wrapEmail(body) };
}

function buildNudgeEmail(name: string) {
  const body = `
<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;color:${TEXT};">Hey ${esc(name)},</p>
<p style="margin:0 0 26px;font-family:Arial,sans-serif;font-size:14px;color:${MUTED};line-height:1.6;">You didn&rsquo;t get to a session this week &mdash; no streak lost, just a nudge. Even one quick round keeps you sharp for the real thing.</p>
${ctaButton("Hop back in")}`;
  return { subject: "Jump back into Mocko?", html: wrapEmail(body) };
}

async function sendEmail(transporter: ReturnType<typeof nodemailer.createTransport>, to: string, subject: string, html: string) {
  await transporter.sendMail({ from: `Mocko <${SENDER}>`, to, subject, html });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.headers.get("X-Cron-Secret") !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetUserId: string | undefined = body.userId;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let profiles: { user_id: string; username: string | null; full_name: string | null }[];
    if (targetUserId) {
      const { data, error } = await supabase.from("profiles").select("user_id, username, full_name").eq("user_id", targetUserId);
      if (error) throw error;
      profiles = data || [];
    } else {
      const { data, error } = await supabase.from("profiles").select("user_id, username, full_name").eq("notify_weekly_summary", true);
      if (error) throw error;
      profiles = data || [];
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 587, secure: false,
      auth: { user: SENDER, pass: GMAIL_APP_PASSWORD },
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const results: { userId: string; sent: boolean; variant?: string; error?: string }[] = [];

    for (const profile of profiles) {
      try {
        const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(profile.user_id);
        if (userErr || !userData?.user?.email) throw new Error("No email on file");
        const email = userData.user.email;
        const name = profile.username || profile.full_name || "there";

        const { data: sessions, error: sessErr } = await supabase
          .from("sessions").select("created_at, mode, difficulty, overall_score, category_scores")
          .eq("user_id", profile.user_id).gte("created_at", weekAgo).order("created_at", { ascending: false });
        if (sessErr) throw sessErr;

        const { data: prevSessions, error: prevErr } = await supabase
          .from("sessions").select("overall_score")
          .eq("user_id", profile.user_id).not("overall_score", "is", null)
          .gte("created_at", twoWeeksAgo).lt("created_at", weekAgo);
        if (prevErr) throw prevErr;
        const prevAvg = prevSessions && prevSessions.length
          ? prevSessions.reduce((a, s) => a + Number(s.overall_score), 0) / prevSessions.length
          : null;

        const { data: drills, error: drillErr } = await supabase
          .from("drill_scores").select("drill_key, score")
          .eq("user_id", profile.user_id).gte("created_at", weekAgo).order("score", { ascending: false });
        if (drillErr) throw drillErr;

        const played = (sessions && sessions.length > 0) || (drills && drills.length > 0);
        const { subject, html } = played
          ? buildBreakdownEmail(name, (sessions || []) as SessionRow[], prevAvg, (drills || []) as DrillRow[])
          : buildNudgeEmail(name);

        await sendEmail(transporter, email, subject, html);
        results.push({ userId: profile.user_id, sent: true, variant: played ? "breakdown" : "nudge" });
      } catch (err) {
        console.error(`Failed for user ${profile.user_id}:`, err);
        results.push({ userId: profile.user_id, sent: false, error: String(err) });
      }
    }

    return json({ sent: results.filter((r) => r.sent).length, failed: results.filter((r) => !r.sent).length, results });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
