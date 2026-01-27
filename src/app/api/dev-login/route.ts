import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  try {
    // Find the test user
    const user = await prisma.user.findUnique({
      where: { email: "test@clipscout.dev" },
    });

    if (!user) {
      return NextResponse.json({ error: "Test user not found. Run prisma db seed first." }, { status: 404 });
    }

    // Create a session token
    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create a database session
    await prisma.session.upsert({
      where: {
        sessionToken: sessionToken,
      },
      update: {
        expires,
      },
      create: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set("authjs.session-token", sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires,
    });

    // Redirect to the callback URL
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  } catch (error) {
    console.error("Dev login error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
