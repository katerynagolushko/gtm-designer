import { NextResponse } from "next/server";
import { consumeLoginToken, createSession, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirectBase } from "@/lib/public-url";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const base = redirectBase(req);

  const email = token ? await consumeLoginToken(token) : null;
  if (!email) {
    return NextResponse.redirect(`${base}/login?error=expired`);
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: { email },
    update: {},
  });

  const { raw, expiresAt } = await createSession(user.id);
  // Set the cookie on this redirect response. cookies().set() writes to a
  // separate store that a hand-built NextResponse.redirect() does not include,
  // so the browser follows the redirect with no session.
  const response = NextResponse.redirect(`${base}/designer`);
  response.cookies.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
