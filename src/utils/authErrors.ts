/**
 * Human-readable copy for Firebase Auth / Callable failures on sign-in screens.
 */
export function friendlySignInError(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const code = String((e as { code?: string }).code ?? '');
    const msg = String((e as { message?: string }).message ?? '');

    if (code === 'functions/not-found') {
      return 'Email sign-in codes are not set up (Cloud Function missing). In app.json set requireLoginEmailOtp to false, or deploy sendLoginOtp / verifyLoginOtp.';
    }
    if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
      return 'Could not reach the server. Check your connection and try again.';
    }
    if (code === 'functions/internal') {
      return 'The sign-in service returned an error. If you use email codes, confirm Resend is configured on Cloud Functions.';
    }

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Wrong email or password.';
    }
    if (code === 'auth/user-not-found') {
      return 'No account found for that email. Create an account first.';
    }
    if (code === 'auth/invalid-email') {
      return 'That email address does not look valid.';
    }
    if (code === 'auth/user-disabled') {
      return 'This account has been disabled.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts. Wait a few minutes and try again.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error. Check your connection and try again.';
    }

    if (msg) return msg;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}
