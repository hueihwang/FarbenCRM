import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, requireAdmin, success, badRequest } from "@/lib/api-utils";
import { db } from "@/db";
import { objects, attributes, statuses, records } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createRecord } from "@/services/records";
import { createTask } from "@/services/tasks";
import { createNote } from "@/services/notes";

export const maxDuration = 120;

/**
 * One-shot demo seeder. Creates realistic specialty-pigment/coatings test data
 * so Customer Insights, search, and pipeline views have something to chew on.
 *
 * POST /api/v1/admin/seed-demo            → create demo records
 * POST /api/v1/admin/seed-demo?wipe=1     → delete existing demo records first
 *
 * Demo records are tagged by setting createdBy = <caller userId> and a marker
 * is not used; the ?wipe=1 flag only removes records this endpoint could
 * plausibly have created (those whose name matches the fixed company list).
 */

const COMPANIES = [
  {
    name: "Nippon Paint Malaysia",
    domain: "nipponpaint.com.my",
    description:
      "Top-3 decorative paint manufacturer in Malaysia. Long-standing account — buys phthalo blue and organic red dispersions for interior line. Annual pigment spend est. RM 3.2M.",
    city: "Shah Alam",
    state: "Selangor",
    country: "MY",
  },
  {
    name: "Jotun Paints (Malaysia)",
    domain: "jotun.com",
    description:
      "Protective & marine coatings. Active on industrial TiO2 slurries and iron oxide pastes. Technical fit strong; pricing pressure from local competitors.",
    city: "Nilai",
    state: "Negeri Sembilan",
    country: "MY",
  },
  {
    name: "Kansai Paint Malaysia",
    domain: "kansaipaint.com.my",
    description:
      "Automotive refinish and industrial OEM. Evaluating our high-chroma quinacridone reds for new metallic refinish line. Sample stage since Jan.",
    city: "Port Klang",
    state: "Selangor",
    country: "MY",
  },
  {
    name: "AkzoNobel Decorative Paints Malaysia",
    domain: "akzonobel.com",
    description:
      "Dulux brand owner. Procurement consolidated through Singapore hub. Large volume but low margin — mostly commodity carbon blacks and yellow iron oxides.",
    city: "Petaling Jaya",
    state: "Selangor",
    country: "MY",
  },
  {
    name: "Berger Paints Malaysia",
    domain: "bergerpaints.com.my",
    description:
      "Mid-tier decorative + wood coatings. Smaller volumes, pays on time. Good test account for new product trials.",
    city: "Subang Jaya",
    state: "Selangor",
    country: "MY",
  },
  {
    name: "Hup Soon Plastic Industries",
    domain: "hupsoonplastic.com",
    description:
      "Masterbatch compounder serving packaging and automotive interior. Prospect — currently buys from BASF and Clariant. Price-sensitive but responsive.",
    city: "Johor Bahru",
    state: "Johor",
    country: "MY",
  },
  {
    name: "Petronas Chemicals Polymers",
    domain: "petronaschemicals.com.my",
    description:
      "Polyolefin producer. R&D conversation about pigment pastes for film applications. Long sales cycle; could be strategic.",
    city: "Kuala Lumpur",
    state: "Wilayah Persekutuan",
    country: "MY",
  },
  {
    name: "Toyo Ink Group (Malaysia)",
    domain: "toyoink.com.my",
    description:
      "Printing inks and industrial coatings. Historically buys ex-China; opening to domestic suppliers due to shipping volatility.",
    city: "Shah Alam",
    state: "Selangor",
    country: "MY",
  },
];

interface PersonSpec {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyIdx: number;
  city: string;
}

const PEOPLE: PersonSpec[] = [
  { firstName: "Arif", lastName: "Rahman", email: "arif.rahman@nipponpaint.com.my", phone: "+60 3 5521 1234", jobTitle: "Head of Procurement", companyIdx: 0, city: "Shah Alam" },
  { firstName: "Mei Ling", lastName: "Tan", email: "mling.tan@nipponpaint.com.my", phone: "+60 12 345 8821", jobTitle: "Senior Formulator", companyIdx: 0, city: "Shah Alam" },
  { firstName: "Ravi", lastName: "Subramaniam", email: "ravi.s@jotun.com", phone: "+60 6 799 4210", jobTitle: "Purchasing Manager", companyIdx: 1, city: "Nilai" },
  { firstName: "Kjell", lastName: "Andersen", email: "kjell.andersen@jotun.com", phone: "+60 6 799 4211", jobTitle: "Technical Director, SEA", companyIdx: 1, city: "Nilai" },
  { firstName: "Hiroshi", lastName: "Yamada", email: "h.yamada@kansaipaint.com.my", phone: "+60 3 3176 5000", jobTitle: "R&D Manager", companyIdx: 2, city: "Port Klang" },
  { firstName: "Siti", lastName: "Abdullah", email: "siti.a@kansaipaint.com.my", phone: "+60 12 678 1200", jobTitle: "Procurement Executive", companyIdx: 2, city: "Port Klang" },
  { firstName: "Daniel", lastName: "Lim", email: "daniel.lim@akzonobel.com", phone: "+65 6635 4200", jobTitle: "Regional Sourcing Lead (SEA)", companyIdx: 3, city: "Singapore" },
  { firstName: "Priya", lastName: "Nair", email: "priya.nair@akzonobel.com", phone: "+60 3 7955 0800", jobTitle: "Formulation Chemist", companyIdx: 3, city: "Petaling Jaya" },
  { firstName: "Wei Chen", lastName: "Ng", email: "wc.ng@bergerpaints.com.my", phone: "+60 3 5633 1122", jobTitle: "Purchasing Officer", companyIdx: 4, city: "Subang Jaya" },
  { firstName: "Noraini", lastName: "Ismail", email: "noraini@bergerpaints.com.my", phone: "+60 3 5633 1125", jobTitle: "Quality Assurance Manager", companyIdx: 4, city: "Subang Jaya" },
  { firstName: "Tan Kok Wai", lastName: "Lee", email: "kw.lee@hupsoonplastic.com", phone: "+60 7 554 8899", jobTitle: "Managing Director", companyIdx: 5, city: "Johor Bahru" },
  { firstName: "Jessica", lastName: "Chin", email: "jessica.chin@hupsoonplastic.com", phone: "+60 7 554 8812", jobTitle: "Compounding Technical Lead", companyIdx: 5, city: "Johor Bahru" },
  { firstName: "Dr. Farhan", lastName: "Zakaria", email: "farhan.z@petronaschemicals.com.my", phone: "+60 3 2051 5000", jobTitle: "Senior R&D Scientist", companyIdx: 6, city: "Kuala Lumpur" },
  { firstName: "Yoshiko", lastName: "Nakamura", email: "yoshiko.n@toyoink.com.my", phone: "+60 3 5192 3388", jobTitle: "Supply Chain Manager", companyIdx: 7, city: "Shah Alam" },
  { firstName: "Adrian", lastName: "Teo", email: "adrian.teo@toyoink.com.my", phone: "+60 12 899 4411", jobTitle: "New Product Development Manager", companyIdx: 7, city: "Shah Alam" },
];

interface DealSpec {
  name: string;
  valueRM: number;
  stage: "Lead" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
  companyIdx: number;
  peopleIdx: number[];
  expectedCloseDays: number; // from today, can be negative for historical
  description?: string;
}

const DEALS: DealSpec[] = [
  { name: "Nippon Paint — 2026 Q1 phthalo blue BT contract", valueRM: 860000, stage: "Negotiation", companyIdx: 0, peopleIdx: [0, 1], expectedCloseDays: 18 },
  { name: "Nippon Paint — Red BNP dispersion renewal", valueRM: 420000, stage: "Won", companyIdx: 0, peopleIdx: [0], expectedCloseDays: -22 },
  { name: "Jotun — Protective coatings TiO2 slurry", valueRM: 1250000, stage: "Proposal", companyIdx: 1, peopleIdx: [2, 3], expectedCloseDays: 45 },
  { name: "Kansai — Metallic refinish quinacridone trial", valueRM: 180000, stage: "Qualified", companyIdx: 2, peopleIdx: [4], expectedCloseDays: 60 },
  { name: "AkzoNobel — Carbon black commodity bid", valueRM: 640000, stage: "Lost", companyIdx: 3, peopleIdx: [6], expectedCloseDays: -14 },
  { name: "Berger Paints — Wood coating pigment pilot", valueRM: 95000, stage: "Proposal", companyIdx: 4, peopleIdx: [8, 9], expectedCloseDays: 30 },
  { name: "Hup Soon — Masterbatch red 254 supply", valueRM: 310000, stage: "Qualified", companyIdx: 5, peopleIdx: [10, 11], expectedCloseDays: 75 },
  { name: "Petronas Polymers — Film-grade pigment evaluation", valueRM: 540000, stage: "Lead", companyIdx: 6, peopleIdx: [12], expectedCloseDays: 120 },
  { name: "Toyo Ink — Printing ink blue dispersion", valueRM: 215000, stage: "Lead", companyIdx: 7, peopleIdx: [13, 14], expectedCloseDays: 90 },
  { name: "Toyo Ink — Yellow iron oxide paste", valueRM: 110000, stage: "Negotiation", companyIdx: 7, peopleIdx: [13], expectedCloseDays: 12 },
];

interface TaskSpec {
  content: string;
  daysFromToday: number;
  companyIdx?: number;
  peopleIdx?: number;
  dealIdx?: number;
}

const TASKS: TaskSpec[] = [
  { content: "Follow up with Arif on phthalo blue pricing revision", daysFromToday: -3, companyIdx: 0, peopleIdx: 0, dealIdx: 0 },
  { content: "Send TDS and COA samples to Mei Ling for Red BNP", daysFromToday: 2, companyIdx: 0, peopleIdx: 1 },
  { content: "Prepare technical proposal for Jotun TiO2 slurry", daysFromToday: 5, companyIdx: 1, dealIdx: 2 },
  { content: "Schedule plant visit with Kjell Andersen", daysFromToday: 14, companyIdx: 1, peopleIdx: 3 },
  { content: "Send 2kg quinacridone sample to Hiroshi", daysFromToday: -8, companyIdx: 2, peopleIdx: 4, dealIdx: 3 },
  { content: "Check back with Siti on payment terms discussion", daysFromToday: 7, companyIdx: 2, peopleIdx: 5 },
  { content: "Debrief AkzoNobel Q1 bid loss — pricing post-mortem", daysFromToday: -1, companyIdx: 3, dealIdx: 4 },
  { content: "Quarterly business review with Daniel Lim", daysFromToday: 28, companyIdx: 3, peopleIdx: 6 },
  { content: "Wood coating pilot kick-off with Wei Chen", daysFromToday: 3, companyIdx: 4, peopleIdx: 8, dealIdx: 5 },
  { content: "Audit Berger QA requirements with Noraini", daysFromToday: 21, companyIdx: 4, peopleIdx: 9 },
  { content: "Prepare masterbatch sample kit for Hup Soon (3 colors)", daysFromToday: -5, companyIdx: 5, dealIdx: 6 },
  { content: "MD meeting — Tan Kok Wai, strategic partnership discussion", daysFromToday: 10, companyIdx: 5, peopleIdx: 10 },
  { content: "R&D technical call with Dr. Farhan on film-grade pigments", daysFromToday: 4, companyIdx: 6, peopleIdx: 12, dealIdx: 7 },
  { content: "Send Toyo Ink NDA for formulation disclosure", daysFromToday: -2, companyIdx: 7, peopleIdx: 14 },
  { content: "Finalize yellow iron oxide paste pricing for Toyo", daysFromToday: 6, companyIdx: 7, dealIdx: 9 },
  { content: "Update CRM — log all trade show leads from Interpack", daysFromToday: 1 },
  { content: "Monthly pipeline review with sales team", daysFromToday: 8 },
  { content: "Send Q1 customer satisfaction survey", daysFromToday: 15 },
  { content: "Research Jotun Group global sourcing strategy", daysFromToday: -4, companyIdx: 1 },
  { content: "Prepare competitor price intel report (BASF, Clariant, DIC)", daysFromToday: 12 },
];

interface NoteSpec {
  recordType: "company" | "person" | "deal";
  recordIdx: number;
  title: string;
  body: string;
}

const NOTES: NoteSpec[] = [
  {
    recordType: "company",
    recordIdx: 0,
    title: "Annual review meeting — Feb",
    body: "Met with Arif and procurement team. They confirmed continued demand for phthalo blue BT at roughly current volumes. Mentioned interest in our new transparent yellow if we can hit 95% color strength vs BASF. Potential Q2 opportunity worth ~RM 300k.",
  },
  {
    recordType: "company",
    recordIdx: 1,
    title: "Jotun plant tour notes",
    body: "Toured Nilai facility. Their biggest pain point is TiO2 slurry consistency between batches. If we can guarantee <1.5% viscosity variance they will shift 40% of volume. Kjell is technical champion internally.",
  },
  {
    recordType: "deal",
    recordIdx: 0,
    title: "Pricing call — phthalo blue",
    body: "Arif asked for 4% discount on the 2026 contract. We offered 2% with a 3-year lock. He's taking to CFO. Closing risk: BASF made an unsolicited offer last week at similar pricing. Technical advantage (our deeper shade) is key differentiator.",
  },
  {
    recordType: "deal",
    recordIdx: 2,
    title: "Technical spec review",
    body: "Jotun confirmed our draft spec meets their protective coating requirements. Outstanding items: 1) COA frequency (they want per-batch, we offered quarterly), 2) packaging (they want 1T IBC, we proposed drums). Will revise proposal and resubmit by end of month.",
  },
  {
    recordType: "person",
    recordIdx: 12,
    title: "Dr. Farhan intro call",
    body: "Farhan leads Petronas polymer R&D group. Currently evaluating 3 pigment suppliers for new film extrusion line. Timeline: qualification through end of year, commercial from H2 2026 if successful. He's technically detailed — send full technical dossier before next call.",
  },
];

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const wipe = req.nextUrl.searchParams.get("wipe") === "1";

  // Resolve object IDs
  const [peopleObj] = await db.select().from(objects).where(and(eq(objects.workspaceId, ctx.workspaceId), eq(objects.slug, "people"))).limit(1);
  const [companiesObj] = await db.select().from(objects).where(and(eq(objects.workspaceId, ctx.workspaceId), eq(objects.slug, "companies"))).limit(1);
  const [dealsObj] = await db.select().from(objects).where(and(eq(objects.workspaceId, ctx.workspaceId), eq(objects.slug, "deals"))).limit(1);

  if (!peopleObj || !companiesObj || !dealsObj) {
    return badRequest("Required objects (people, companies, deals) not found in workspace");
  }

  // Resolve deal stage status IDs
  const [stageAttr] = await db.select().from(attributes).where(and(eq(attributes.objectId, dealsObj.id), eq(attributes.slug, "stage"))).limit(1);
  if (!stageAttr) return badRequest("Deal 'stage' attribute not found");
  const stageRows = await db.select().from(statuses).where(eq(statuses.attributeId, stageAttr.id));
  const stageByTitle: Record<string, string> = {};
  for (const s of stageRows) stageByTitle[s.title] = s.id;

  const missingStage = DEALS.find((d) => !stageByTitle[d.stage]);
  if (missingStage) return badRequest(`Deal stage '${missingStage.stage}' not found in workspace`);

  // Optional wipe: delete existing records whose display name matches our fixtures
  let wiped = 0;
  if (wipe) {
    const companyNames = new Set(COMPANIES.map((c) => c.name));
    const dealNames = new Set(DEALS.map((d) => d.name));
    const peopleFullNames = new Set(PEOPLE.map((p) => `${p.firstName} ${p.lastName}`));

    const existingCompanies = await db.select({ id: records.id }).from(records)
      .where(and(eq(records.objectId, companiesObj.id)));
    const existingDeals = await db.select({ id: records.id }).from(records)
      .where(and(eq(records.objectId, dealsObj.id)));
    const existingPeople = await db.select({ id: records.id }).from(records)
      .where(and(eq(records.objectId, peopleObj.id)));

    // We have to load and check values — use getRecord for each. This is slow but
    // only runs on explicit wipe.
    const { getRecord } = await import("@/services/records");
    for (const r of [...existingCompanies, ...existingDeals, ...existingPeople]) {
      const isCompany = existingCompanies.some((c) => c.id === r.id);
      const isDeal = existingDeals.some((d) => d.id === r.id);
      const objId = isCompany ? companiesObj.id : isDeal ? dealsObj.id : peopleObj.id;
      const full = await getRecord(objId, r.id);
      if (!full) continue;
      const vals = (full.values ?? {}) as Record<string, unknown>;
      let match = false;
      if (isCompany || isDeal) {
        const name = vals.name as string | undefined;
        if (name && (companyNames.has(name) || dealNames.has(name))) match = true;
      } else {
        const name = vals.name as { fullName?: string } | undefined;
        if (name?.fullName && peopleFullNames.has(name.fullName)) match = true;
      }
      if (match) {
        await db.delete(records).where(eq(records.id, r.id));
        wiped++;
      }
    }
  }

  const companyIds: string[] = [];
  const personIds: string[] = [];
  const dealIds: string[] = [];

  // Companies
  for (const c of COMPANIES) {
    const rec = await createRecord(companiesObj.id, {
      name: c.name,
      domains: [c.domain],
      description: c.description,
      primary_location: { city: c.city, state: c.state, countryCode: c.country },
    }, ctx.userId);
    companyIds.push(rec!.id);
  }

  // People (link to company by index)
  for (const p of PEOPLE) {
    const rec = await createRecord(peopleObj.id, {
      name: {
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: `${p.firstName} ${p.lastName}`,
      },
      email_addresses: [p.email],
      phone_numbers: [p.phone],
      job_title: p.jobTitle,
      company: companyIds[p.companyIdx],
      location: { city: p.city, countryCode: "MY" },
    }, ctx.userId);
    personIds.push(rec!.id);
  }

  // Deals
  const today = new Date();
  for (const d of DEALS) {
    const closeDate = new Date(today);
    closeDate.setDate(today.getDate() + d.expectedCloseDays);
    const rec = await createRecord(dealsObj.id, {
      name: d.name,
      value: { amount: d.valueRM, currencyCode: "MYR" },
      stage: stageByTitle[d.stage],
      expected_close_date: closeDate.toISOString().slice(0, 10),
      company: companyIds[d.companyIdx],
      associated_people: d.peopleIdx.map((i) => personIds[i]),
      owner: ctx.userId,
    }, ctx.userId);
    dealIds.push(rec!.id);
  }

  // Tasks
  let tasksCreated = 0;
  for (const t of TASKS) {
    const due = new Date(today);
    due.setDate(today.getDate() + t.daysFromToday);
    const linkedIds: string[] = [];
    if (t.companyIdx !== undefined) linkedIds.push(companyIds[t.companyIdx]);
    if (t.peopleIdx !== undefined) linkedIds.push(personIds[t.peopleIdx]);
    if (t.dealIdx !== undefined) linkedIds.push(dealIds[t.dealIdx]);
    await createTask(t.content, ctx.userId, ctx.workspaceId, {
      deadline: due.toISOString(),
      recordIds: linkedIds.length > 0 ? linkedIds : undefined,
      assigneeIds: [ctx.userId],
    });
    tasksCreated++;
  }

  // Notes
  let notesCreated = 0;
  for (const n of NOTES) {
    const targetId =
      n.recordType === "company" ? companyIds[n.recordIdx] :
      n.recordType === "person" ? personIds[n.recordIdx] :
      dealIds[n.recordIdx];
    if (!targetId) continue;
    const tiptap = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: n.body }] }],
    };
    await createNote(targetId, n.title, tiptap, ctx.userId);
    notesCreated++;
  }

  return success({
    wiped,
    created: {
      companies: companyIds.length,
      people: personIds.length,
      deals: dealIds.length,
      tasks: tasksCreated,
      notes: notesCreated,
    },
  });
}
