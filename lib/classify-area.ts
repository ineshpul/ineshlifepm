import type { Area } from "./types";

/** Keyword hints per area id — used to auto-sort weekly task capture. */
const AREA_KEYWORDS: Record<string, string[]> = {
  school: [
    "homework", "assignment", "exam", "quiz", "class", "lecture", "prof", "canvas", "midterm",
    "essay", "lab", "section", "syllabus", "study", "gpa", "course", "visa", "passport", "errand", "logistics", "abroad", "paperwork",
  ],
  "pm-recruiting": ["interview", "recruiting", "application", "resume", "cover letter", "pm ", "product manager"],
  "leap-b2c": ["leap", "retention", "onboarding", "b2c", "users", "d7"],
  "leap-b2b": ["pilot", "b2b", "enterprise", "sales"],
  "investor-relations": [
    "investor", "investors", "fundraise", "fundraising", "pitch", "deck", "data room", "term sheet",
    "vc", "venture", "angel", "pre-seed", "seed round", "diligence", "one-pager", "cap table", "ir ",
  ],
  findi: ["findi", "filing", "tax", "1099"],
  "personal-brand": ["substack", "post", "linkedin", "twitter", "tiktok", "subscriber", "content"],
  campus: ["campus", "iu ", "uiuc", "outreach", "org"],
  "health-sport": ["gym", "workout", "run", "soccer", "lift", "training"],
  hobbies: ["hobby", "game", "read for fun"],
};

export type AreaGuess = {
  areaId: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export function guessAreaForTask(title: string, areas: Area[]): AreaGuess {
  const t = title.toLowerCase().trim();
  if (!t) {
    const fallback = areas[0]?.id ?? "school";
    return { areaId: fallback, confidence: "low", reason: "Pick an area" };
  }

  for (const area of areas) {
    const name = area.name.toLowerCase();
    if (t.includes(name) || name.split(/\s+/).some((w) => w.length > 3 && t.includes(w))) {
      return { areaId: area.id, confidence: "high", reason: `Matched “${area.name}”` };
    }
  }

  let best: { areaId: string; score: number; kw: string } | null = null;
  for (const [areaId, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (!areas.some((a) => a.id === areaId)) continue;
    for (const kw of keywords) {
      if (t.includes(kw)) {
        const score = kw.length;
        if (!best || score > best.score) best = { areaId, score, kw };
      }
    }
  }
  if (best) {
    const area = areas.find((a) => a.id === best!.areaId);
    return {
      areaId: best.areaId,
      confidence: best.score >= 5 ? "high" : "medium",
      reason: `Sounds like ${area?.name ?? best.areaId} (“${best.kw}”)`,
    };
  }

  const fallback = areas[0]?.id ?? "school";
  return { areaId: fallback, confidence: "low", reason: "No strong match — pick an area" };
}
