import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guessAreaForTask } from "../lib/classify-area";
import type { Area } from "../lib/types";

const areas: Area[] = [
  { id: "school", name: "School", colorToken: "blue", sortOrder: 0, isCadenceOnly: false },
  { id: "hobbies", name: "Hobbies", colorToken: "fuchsia", sortOrder: 1, isCadenceOnly: false },
];

describe("guessAreaForTask", () => {
  it("matches school keywords", () => {
    const g = guessAreaForTask("Finish chem lab homework", areas);
    assert.equal(g.areaId, "school");
    assert.notEqual(g.confidence, "low");
  });

  it("matches investor relations keywords", () => {
    const irAreas: Area[] = [
      { id: "investor-relations", name: "Investor relations", colorToken: "ir", sortOrder: 0, isCadenceOnly: false },
      { id: "hobbies", name: "Hobbies", colorToken: "fuchsia", sortOrder: 1, isCadenceOnly: false },
    ];
    const g = guessAreaForTask("Send monthly investor update", irAreas);
    assert.equal(g.areaId, "investor-relations");
  });

  it("falls back to first area when unknown", () => {
    const g = guessAreaForTask("random thing", areas);
    assert.equal(g.areaId, "school");
  });
});
