import { NextResponse } from "next/server";
import { getSettingsByToken, listTasks } from "@/lib/repo";
import { buildIcsFeed, tasksAndBlocksToIcsEvents } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettingsByToken(token);
  if (!settings) {
    return new NextResponse("Not found", { status: 404 });
  }

  const tasks = await listTasks();
  const relevant = tasks.filter((t) => t.scheduledAt || t.dueAt);
  const now = new Date();
  const events = tasksAndBlocksToIcsEvents(relevant, settings.recurringBlocks, now);
  const lastModified =
    relevant.length > 0
      ? new Date(Math.max(...relevant.map((t) => new Date(t.lastTouchedAt).getTime()), now.getTime() - 1))
      : now;

  const feed = buildIcsFeed(events, lastModified);

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="personal-pm.ics"',
      "Last-Modified": lastModified.toUTCString(),
      "Cache-Control": "no-cache",
    },
  });
}
