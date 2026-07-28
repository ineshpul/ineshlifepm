import { AREA_COLOR_HEX } from "@/lib/constants";

export function AreaTag({ name, colorToken }: { name: string; colorToken: string }) {
  const hex = AREA_COLOR_HEX[colorToken] ?? "#71717a";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hairline"
      style={{ color: hex, borderColor: hex + "40" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
      {name}
    </span>
  );
}
