import Link from "next/link";

export default function LoginPage() {
  const hasAuth =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card max-w-md space-y-4 p-8">
        <h1 className="font-display text-2xl font-bold">Sign in to nesh</h1>
        <p className="text-sm text-[#6b6f7d]">
          Each invited teammate gets their own workspace copy — areas, sectors, goals, tasks, and documents. Use the
          invite link from your workspace owner to join.
        </p>
        {hasAuth ? (
          <p className="text-sm text-[#6b6f7d]">
            Email sign-in is enabled. Open your invite link (<code className="text-xs">/join?token=…</code>) to create
            an account and attach to that workspace. Full OAuth UI ships next; for now use Settings → Team to generate
            invites.
          </p>
        ) : (
          <p className="rounded-lg bg-[#f4f4f8] px-3 py-2 text-sm text-[#6b6f7d]">
            Add <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable hosted sign-in. Until then, the app
            runs in single-user mode with the default workspace.
          </p>
        )}
        <Link href="/today" className="inline-block text-sm font-semibold text-[#6d4aff] hover:underline">
          ← Continue to app
        </Link>
      </div>
    </div>
  );
}
