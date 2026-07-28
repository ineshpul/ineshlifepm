// Seed data per PRD §16. Safe to re-run — uses stable ids, so it upserts
// rather than duplicating. Run with: npm run seed
import {
  saveArea, saveInitiative, saveGoal, saveCadenceRule, saveAssignee, saveMetric, getSettings,
} from "../lib/repo";
import { SEED_AREAS } from "../lib/constants";
import type { Initiative, Goal, CadenceRule, Assignee, Metric } from "../lib/types";

const now = new Date().toISOString();
// Restart date for the parked personal-brand initiatives — first Monday
// after Lollapalooza (assumption noted in PRD §16.1).
const AFTER_LOLLAPALOOZA = "2026-08-05T00:00:00.000Z";

async function main() {
  console.log("Seeding areas…");
  for (const a of SEED_AREAS) {
    await saveArea({ ...a });
  }

  console.log("Seeding assignees…");
  const assignees: Assignee[] = [
    { id: "assignee-rohan", name: "Rohan", reliability: "reliable", active: true },
    { id: "assignee-ronin", name: "Ronin", reliability: "reliable", active: true },
    { id: "assignee-andre", name: "Andre", reliability: "variable", active: true },
  ];
  for (const a of assignees) await saveAssignee(a);

  console.log("Seeding cadence rules (§16.6)…");
  const cadenceRules: CadenceRule[] = [
    { id: "cadence-gym", areaId: "health-sport", title: "Gym", targetPerWeek: 4, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
    { id: "cadence-soccer", areaId: "health-sport", title: "Soccer", targetPerWeek: 2, minPerWeek: 1, currentWeekCount: 0, weekOf: "" },
    { id: "cadence-substack", areaId: "personal-brand", title: "Substack", targetPerWeek: 2, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
    { id: "cadence-x", areaId: "personal-brand", title: "X", targetPerWeek: 14, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
    { id: "cadence-tiktok", areaId: "personal-brand", title: "TikTok", targetPerWeek: 14, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
    { id: "cadence-user-chats", areaId: "leap-b2c", title: "User chats", targetPerWeek: 3, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
  ];
  for (const r of cadenceRules) await saveCadenceRule(r);

  console.log("Seeding initiatives (§16.1–16.5)…");

  // §16.1 Personal brand — three initiatives, parked until after Lollapalooza.
  const substackPlan: Initiative = {
    id: "init-substack-plan",
    areaId: "personal-brand",
    title: "Substack plan",
    planBody:
      "Target 2 posts per week. Work through the topic bank by end of semester.\n\n" +
      "Topic bank:\n" +
      "- Attention as the scarce contested good under something like UBI. Closest piece to Leap's long-term vision.\n" +
      "- The AI-relationship experiment: does building a personal relationship with an AI change output quality. Arms: human-like tone, negative reinforcement, task-oriented and specific.\n" +
      "- China markets, drawing on the KWEB versus KBA work.\n" +
      "- AI engineering and multi-agent architecture, drawing on the agent pipeline build.\n" +
      "- The Leap scaling journey, told with the full vision in mind.\n" +
      "- Philosophical and self-transparent pieces.\n\n" +
      "Constraint: no strong public political positioning, for recruiting reasons.",
    status: "parked",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: AFTER_LOLLAPALOOZA,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };

  const xPlan: Initiative = {
    id: "init-x-plan",
    areaId: "personal-brand",
    title: "X plan",
    planBody:
      "2 posts per day, questions count. 1 to 2 higher-quality posts per week. " +
      "Niche: AI, tech, financial markets, Leap, philosophy.",
    status: "parked",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: AFTER_LOLLAPALOOZA,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };

  const tiktokPlan: Initiative = {
    id: "init-tiktok-plan",
    areaId: "personal-brand",
    title: "TikTok and Instagram plan",
    planBody:
      "2 TikToks per day. Positioning narrowed to AI plus Leap only: how a builder with a business " +
      "background reads the AI market and makes decisions from it. Same posts to Instagram on the Leap account.",
    status: "parked",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: AFTER_LOLLAPALOOZA,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };

  // §16.2 Campus
  const iuOutreachGoal: Goal = {
    id: "goal-iu-incentive",
    areaId: "campus",
    initiativeId: "init-iu-outreach",
    title: "Define the incentive for student orgs and students to work on Leap",
    successDefinition: "", // open problem — cannot go active until this is answered (§5.3)
    targetDate: null,
    priority: 5,
    status: "not_started",
    visionItemId: null,
  };

  const iuOutreach: Initiative = {
    id: "init-iu-outreach",
    areaId: "campus",
    title: "IU outreach plan",
    planBody:
      "Recruit student organizations, arts and media school in particular, for marketing video work and " +
      "social media. Currently working with 101 Stem Consulting. Crimson Consulting is the target.\n\n" +
      "Nothing else in this initiative moves reliably until the incentive question is answered — see the linked goal.",
    status: "planning",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: ["goal-iu-incentive"],
  };

  const uiucHandoff: Initiative = {
    id: "init-uiuc-handoff",
    areaId: "campus",
    title: "UIUC outreach handoff",
    planBody: "Same play as the IU outreach plan, run at UIUC.",
    status: "handing_off",
    ownerId: "assignee-ronin",
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [{ date: now, body: "Handoff started. Track what has transferred and what remains here." }],
    metricIds: [],
    goalIds: [],
  };

  // §16.3 Leap B2C
  const retentionNorthStar: Metric = {
    id: "metric-b2c-retention",
    areaId: "leap-b2c",
    name: "D7 retention",
    isNorthStar: true,
    parentMetricId: null,
    currentValue: 0,
    targetValue: 40,
    unit: "%",
    updatedAt: now,
  };

  const retention: Initiative = {
    id: "init-b2c-retention",
    areaId: "leap-b2c",
    title: "Retention",
    planBody:
      "North star and driver tree. TakeTheLeapGate experiment readout. 28-day challenge calendar. " +
      "This is the initiative that matters most — everything else in Leap B2C is subordinate to it.",
    status: "running",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: ["metric-b2c-retention"],
    goalIds: [],
  };

  // §16.4 Leap B2B
  const b2bPipeline: Initiative = {
    id: "init-b2b-pipeline",
    areaId: "leap-b2b",
    title: "Pipeline build",
    planBody: "Stages with written entry and exit criteria. Fill in per-stage criteria as the pipeline firms up.",
    status: "planning",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };

  // §16.5 PM recruiting — three initiatives
  const applications: Initiative = {
    id: "init-pm-applications",
    areaId: "pm-recruiting",
    title: "Applications",
    planBody: "Track target roles, application status, and follow-ups.",
    status: "running",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };
  const outreach: Initiative = {
    id: "init-pm-outreach",
    areaId: "pm-recruiting",
    title: "Outreach",
    planBody: "Networking and informational conversations with target companies.",
    status: "running",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };
  const studyWithBrady: Initiative = {
    id: "init-pm-study-brady",
    areaId: "pm-recruiting",
    title: "Study with Brady",
    planBody: "PM interview prep sessions with Brady. Track topics covered and gaps.",
    status: "running",
    ownerId: null,
    startedAt: now,
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  };

  await saveGoal(iuOutreachGoal);
  for (const init of [
    substackPlan, xPlan, tiktokPlan, iuOutreach, uiucHandoff, retention, b2bPipeline,
    applications, outreach, studyWithBrady,
  ]) {
    await saveInitiative(init);
  }
  await saveMetric(retentionNorthStar);

  console.log("Ensuring settings singleton exists…");
  await getSettings();

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
