import { AREA_COLOR_HEX } from "./constants";

export function areaHex(colorToken: string): string {
  return AREA_COLOR_HEX[colorToken] ?? "#6366f1";
}

/** Soft fill for pills and tags (RRGGBBAA). */
export function areaSoft(colorToken: string, alpha = 0.14): string {
  const hex = areaHex(colorToken).replace("#", "");
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${hex}${a}`;
}

export function areaStyles(colorToken: string) {
  const hex = areaHex(colorToken);
  return {
    hex,
    soft: areaSoft(colorToken, 0.14),
    softStrong: areaSoft(colorToken, 0.22),
    border: areaSoft(colorToken, 0.45),
  };
}
