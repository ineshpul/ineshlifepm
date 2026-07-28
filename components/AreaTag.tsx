import { areaStyles } from "@/lib/area-styles";

export function AreaTag({ name, colorToken }: { name: string; colorToken: string }) {
  const { hex, soft, border } = areaStyles(colorToken);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: hex,
        background: soft,
        border: `1px solid ${border}`,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
      {name}
    </span>
  );
}
