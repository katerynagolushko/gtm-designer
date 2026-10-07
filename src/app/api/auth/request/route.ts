import { NextResponse } from "next/server";
import { z } from "zod";
import { createLoginToken } from "@/lib/auth";
import { usesReadOnlySqlite } from "@/lib/db";
import { MagicLinkError, sendMagicLink } from "@/lib/email";
import { magicLinkBase } from "@/lib/public-url";

const InputSchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  if (usesReadOnlySqlite()) {
    return NextResponse.json(
      {
        error:
          "Sign-in isn't available on this deployment yet — it has no writable database. Connect Postgres and redeploy.",
      },
      { status: 503 },
    );
  }

  const token = await createLoginToken(email);
  const url = `${magicLinkBase(req)}/auth/verify?token=${token}`;

  try {
    await sendMagicLink(email, url);
  } catch (e) {
    console.error("magic link send failed:", e);
    if (e instanceof MagicLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Could not send the sign-in email. Try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
