// POST /api/v1/booth-note
//
// One-shot endpoint for the /booth quick-capture page. Orchestrates:
//   1. Resolve or create a Company
//   2. Resolve or create a Person, linked to that Company
//   3. (Optional) set the Person's urgency (Hot/Warm/Cool)
//   4. Create a Note attached to the Person (or Company if no person)
//
// Booth staff at IRGCE need to log a meeting with a never-before-seen
// company in 3 clicks; the existing Notes UI requires picking an
// existing record first, which is ~8 clicks for a new visitor.

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getAuthContext, unauthorized, badRequest, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { createRecord, updateRecord } from "@/services/records";
import { createNote } from "@/services/notes";
import { getList, addListEntry } from "@/services/lists";
import { db } from "@/db";
import { attributes, selectOptions } from "@/db/schema/objects";

type Urgency = "Hot" | "Warm" | "Cool";

interface BoothNoteBody {
  company: { id?: string; name?: string };
  person?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
  };
  noteTitle?: string;
  noteContent: string;
  urgency?: Urgency;
  /** Optional List ID — if set, the Person is added to this List and the
   *  note title is prefixed with the list name (e.g. "[IRGCE 2026]"). */
  listId?: string;
  /** Optional override for who took the note. Useful when booth staff
   *  share an iPad logged in as one user but multiple people use it. */
  capturedBy?: string;
}

/** Plain text → minimal TipTap JSON document, so the existing rich-text
 *  Notes editor can open and continue editing the booth note later. */
function textToTipTap(text: string) {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
  };
}

/** Append a "Captured by …" trailer to the note content if a name is given.
 *  We bake this into the body (rather than a separate column) so it shows up
 *  natively in every Notes UI that already exists, without schema work. */
function buildNoteContent(noteText: string, capturedBy?: string, eventTag?: string) {
  const lines = [noteText.trim()];
  const trailer: string[] = [];
  if (eventTag) trailer.push(`Event: ${eventTag}`);
  if (capturedBy) trailer.push(`Captured by: ${capturedBy}`);
  if (trailer.length) {
    lines.push("");
    lines.push("— " + trailer.join(" · "));
  }
  return textToTipTap(lines.join("\n"));
}

async function lookupUrgencyOptionId(
  workspaceId: string,
  urgency: Urgency
): Promise<string | null> {
  const peopleObj = await getObjectBySlug(workspaceId, "people");
  if (!peopleObj) return null;
  const [attr] = await db
    .select()
    .from(attributes)
    .where(and(eq(attributes.objectId, peopleObj.id), eq(attributes.slug, "urgency")))
    .limit(1);
  if (!attr) return null;
  const [opt] = await db
    .select()
    .from(selectOptions)
    .where(and(eq(selectOptions.attributeId, attr.id), eq(selectOptions.title, urgency)))
    .limit(1);
  return opt?.id ?? null;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  let body: BoothNoteBody;
  try {
    body = (await req.json()) as BoothNoteBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.company || (!body.company.id && !body.company.name?.trim())) {
    return badRequest("company.id or company.name is required");
  }
  if (!body.noteContent?.trim()) {
    return badRequest("noteContent is required");
  }

  try {
    const peopleObj = await getObjectBySlug(ctx.workspaceId, "people");
    const companiesObj = await getObjectBySlug(ctx.workspaceId, "companies");
    if (!peopleObj || !companiesObj) {
      return NextResponse.json(
        { error: { code: "MISSING_OBJECTS", message: "People/Companies objects not found in workspace" } },
        { status: 500 }
      );
    }

    // 1. Company
    let companyId: string;
    if (body.company.id) {
      companyId = body.company.id;
    } else {
      const created = await createRecord(
        companiesObj.id,
        { name: body.company.name!.trim() },
        ctx.userId
      );
      if (!created) throw new Error("Failed to create company record");
      companyId = created.id;
    }

    // 2. Person (optional — only if a name is given or an existing id picked)
    let personId: string | null = null;
    const wantsPerson =
      !!body.person?.id ||
      !!body.person?.firstName?.trim() ||
      !!body.person?.lastName?.trim();
    if (wantsPerson) {
      if (body.person?.id) {
        personId = body.person.id;
      } else {
        const first = (body.person?.firstName ?? "").trim();
        const last = (body.person?.lastName ?? "").trim();
        const full = [first, last].filter(Boolean).join(" ");
        const created = await createRecord(
          peopleObj.id,
          {
            name: { firstName: first, lastName: last, fullName: full },
            ...(body.person?.email
              ? { email_addresses: [body.person.email.trim()] }
              : {}),
            ...(body.person?.phone
              ? { phone_numbers: [body.person.phone.trim()] }
              : {}),
            ...(body.person?.jobTitle
              ? { job_title: body.person.jobTitle.trim() }
              : {}),
            company: companyId,
          },
          ctx.userId
        );
        if (!created) throw new Error("Failed to create person record");
        personId = created.id;
      }
    }

    // 3. Urgency (only if a person was identified/created)
    if (personId && body.urgency) {
      const optionId = await lookupUrgencyOptionId(ctx.workspaceId, body.urgency);
      if (optionId) {
        await updateRecord(
          peopleObj.id,
          personId,
          { urgency: optionId },
          ctx.userId
        );
      }
    }

    // 4. List membership — only if a person was identified/created and a list
    //    was specified. The list scopes notes by event ("IRGCE 2026 Leads")
    //    so booth notes for any given event are filterable in one click.
    let listName: string | undefined;
    if (body.listId && personId) {
      const list = await getList(body.listId);
      if (!list) {
        return badRequest(`List ${body.listId} not found`);
      }
      listName = list.name;
      await addListEntry(body.listId, personId, ctx.userId);
    }

    // 5. Note — attach to person if we have one, else to company.
    //    Title is prefixed with the list/event so it's scannable in the
    //    Notes index. Content carries the "captured by" trailer.
    const noteRecordId = personId ?? companyId;
    const baseTitle = body.noteTitle?.trim() || "Booth note";
    const titleWithEvent = listName ? `[${listName}] ${baseTitle}` : baseTitle;

    const note = await createNote(
      noteRecordId,
      titleWithEvent,
      buildNoteContent(body.noteContent, body.capturedBy?.trim(), listName),
      ctx.userId
    );

    return success(
      {
        companyId,
        personId,
        noteId: note.id,
        listName,
      },
      201
    );
  } catch (err) {
    console.error("booth-note failed:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Failed to create booth note",
        },
      },
      { status: 500 }
    );
  }
}
