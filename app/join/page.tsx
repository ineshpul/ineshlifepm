import Link from "next/link";
import { getWorkspaceInviteByToken } from "@/lib/repo";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await getWorkspaceInviteByToken(token) : null;
  const expired = invite ? new Date(invite.expiresAt).getTime() < Date.now() : false;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card max-w-md space-y-4 p-8">
        <h1 className="font-display text-2xl font-bold">Join workspace</h1>
        {!token ? (
          <p className="text-sm text-[#6b6f7d]">Missing invite token. Ask your workspace owner for a fresh link.</p>
        ) : !invite ? (
          <p className="text-sm text-[#6b6f7d]">This invite is invalid or was revoked.</p>
        ) : expired ? (
          <p className="text-sm text-[#6b6f7d]">This invite expired. Request a new one from Settings → Team.</p>
        ) : (
          <>
            <p className="text-sm text-[#6b6f7d]">
              You&apos;re invited as <strong>{invite.email}</strong>. Sign in (or create an account) with that email to
              access this workspace&apos;s sectors, goals, and documents.
            </p>
            <Link href="/login" className="btn-accent inline-flex">
              Sign in
            </Link>
          </>
        )}
        <Link href="/today" className="block text-sm font-semibold text-[#6d4aff] hover:underline">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
