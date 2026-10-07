import { Resend } from "resend";

export class MagicLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

// With RESEND_API_KEY set, magic links go out by email. Without it, local dev
// prints the link to the server console. Production must not pretend an email
// was sent — that is what makes sign-in look fine on a laptop and dead online.
export async function sendMagicLink(email: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (isProduction()) {
      throw new MagicLinkError(
        "Sign-in email is not configured on this deployment.",
        503,
      );
    }
    console.log(`\n[dev] Magic link for ${email}:\n${url}\n`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "GTM Sprint <onboarding@resend.dev>",
    to: email,
    subject: "Your GTM Sprint sign-in link",
    text: `Sign in to GTM Sprint Designer:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
  });
  if (!error) return;

  const message = error.message ?? "";
  const restricted =
    /only send testing emails|verify a domain|not verified|domain is not/i.test(message);
  if (restricted) {
    throw new MagicLinkError(
      "The sign-in email could not be delivered. Until the sending domain is verified in Resend, mail only arrives at the address that owns the Resend account.",
      502,
    );
  }
  throw new MagicLinkError("Could not send the sign-in email. Try again.", 502);
}
