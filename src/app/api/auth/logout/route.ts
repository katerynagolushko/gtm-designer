import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { redirectBase } from "@/lib/public-url";

export async function POST(req: Request) {
  await destroySession();
  const response = NextResponse.redirect(`${redirectBase(req)}/`, { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
