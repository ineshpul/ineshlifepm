const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  const t = email.trim();
  return t.length > 3 && EMAIL_RE.test(t);
}

export const PASSWORD_MIN_LENGTH = 8;

export function isValidPassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH;
}
