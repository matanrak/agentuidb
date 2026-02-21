import { NextResponse } from "next/server";
import { safeCompare, createSessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 400 });
  }

  const { secret: provided } = await req.json();

  if (!provided || !(await safeCompare(provided, secret))) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const isHttps = req.headers.get("x-forwarded-proto") === "https";

  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("auth_token");
  return res;
}
