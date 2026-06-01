import { NextResponse } from "next/server";
import { Resend } from "resend";

const MAX_LEN = 1200;
const DEFAULT_TO = "taketheleap.app@gmail.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      challenge?: string;
      website?: string;
    };

    if (body.website?.trim()) {
      return NextResponse.json({ ok: true });
    }

    const challenge = String(body.challenge ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!challenge) {
      return NextResponse.json({ error: "Enter your idea first." }, { status: 400 });
    }
    if (challenge.length > MAX_LEN) {
      return NextResponse.json(
        { error: `Keep it under ${MAX_LEN} characters.` },
        { status: 400 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Suggestions are not configured yet." },
        { status: 503 },
      );
    }

    const to = (process.env.SUGGESTION_TO_EMAIL ?? DEFAULT_TO).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to)) {
      console.error("SUGGESTION_TO_EMAIL invalid", { to });
      return NextResponse.json(
        { error: "Suggestion inbox is misconfigured." },
        { status: 503 },
      );
    }

    const from = process.env.RESEND_FROM_EMAIL ?? "Leap <onboarding@resend.dev>";
    const safeBody = escapeHtml(challenge).replace(/\r\n|\n|\r/gu, "<br/>");
    const fromLine = name ? escapeHtml(name) : "Anonymous";

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: "Leap suggestion (website)",
      html: `<p style="font-size:14px;color:#333;font-weight:700">New leap idea from the website</p>
<p style="font-size:15px;color:#111">${safeBody}</p>
<p style="font-size:13px;color:#666;margin-top:16px">From: ${fromLine}</p>`,
    });

    if (error) {
      console.error("Resend error", error);
      return NextResponse.json(
        { error: "Could not send your suggestion. Try again later." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Suggest API error", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
