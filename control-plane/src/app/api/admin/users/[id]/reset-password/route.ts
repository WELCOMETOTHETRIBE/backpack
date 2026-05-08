import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Password resets are handled by Clerk. Send the user to /sign-in and use the 'Forgot password' link, or reset from the Clerk dashboard.",
    },
    { status: 501 }
  );
}
