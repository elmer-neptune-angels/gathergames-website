import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/" });
  return response;
}
