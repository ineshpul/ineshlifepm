/** Decorative brand frog — always hidden from assistive tech. */
export function FrogDecor({
  size = 48,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brandmark.png"
      alt=""
      width={size}
      height={size}
      className={`frog-mark ${className}`.trim()}
      aria-hidden
    />
  );
}
