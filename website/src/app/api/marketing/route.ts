import { NextResponse } from "next/server";

import { getMarketing } from "../../../lib/getMarketing";

export async function GET() {
  try {
    const payload = await getMarketing();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Marketing API error", e);
    return NextResponse.json(
      { error: "Could not load marketing data." },
      { status: 500 },
    );
  }
}
