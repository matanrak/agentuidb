import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 400 });
  }

  const { secret: provided } = await req.json();

  if (provided !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth_token", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.headers.get("x-forwarded-proto") === "https",
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
