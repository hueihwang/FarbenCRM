/**
 * Client-safe CSV utilities for export and import.
 */

// ─── CSV Export ──────────────────────────────────────────────────────

interface AttributeDef {
  slug: string;
  title: string;
  type: string;
  options?: { id: string; title: string }[];
  statuses?: { id: string; title: string }[];
}

interface RecordRow {
  id: string;
  values: Record<string, unknown>;
}

/** Escape a CSV cell value — quote if it contains comma, newline, or double-quote */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert a typed attribute value to a plain string for CSV export */
function formatValue(value: unknown, attr: AttributeDef): string {
  if (value === null || value === undefined) return "";

  // Arrays (multiselect) — format each element, join with "; "
  if (Array.isArray(value)) {
    return value
      .map((v) => formatValue(v, attr))
      .filter((s) => s.length > 0)
      .join("; ");
  }

  switch (attr.type) {
    case "personal_name": {
      const pn = value as { fullName?: string; firstName?: string; lastName?: string };
      return pn.fullName ?? [pn.firstName, pn.lastName].filter(Boolean).join(" ");
    }
    case "currency": {
      const c = value as { amount?: number; currency?: string; currencyCode?: string };
      if (c.amount !== undefined) {
        const code = c.currencyCode ?? c.currency ?? "";
        return `${c.amount} ${code}`.trim();
      }
      return "";
    }
    case "location": {
      // Tolerate legacy rows saved as a bare string
      if (typeof value === "string") return value;
      const loc = value as { line1?: string; city?: string; state?: string; countryCode?: string; country?: string };
      return [loc.line1, loc.city, loc.state, loc.countryCode ?? loc.country].filter(Boolean).join(", ");
    }
    case "select": {
      const opt = attr.options?.find((o) => o.id === value);
      return opt?.title ?? (typeof value === "string" ? value : "");
    }
    case "status": {
      const st = attr.statuses?.find((s) => s.id === value);
      return st?.title ?? (typeof value === "string" ? value : "");
    }
    case "record_reference": {
      // Hydrated shape: { id, displayName, objectSlug }
      if (value && typeof value === "object" && "displayName" in (value as Record<string, unknown>)) {
        return String((value as { displayName?: string }).displayName ?? "");
      }
      return typeof value === "string" ? value : "";
    }
    case "actor_reference": {
      // Hydrated shape: { id, displayName, email }
      if (value && typeof value === "object" && "displayName" in (value as Record<string, unknown>)) {
        return String((value as { displayName?: string }).displayName ?? "");
      }
      return typeof value === "string" ? value : "";
    }
    case "checkbox":
      return value ? "true" : "false";
    case "date":
    case "timestamp":
      return typeof value === "string" ? value : String(value);
    case "interaction": {
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }
    default:
      // Safe fallback — avoid [object Object] leaking out
      if (typeof value === "object") {
        return String((value as { displayName?: string; name?: string }).displayName
          ?? (value as { name?: string }).name
          ?? "");
      }
      return String(value);
  }
}

/** Generate CSV string from records and attributes */
export function generateCSV(
  records: RecordRow[],
  attributes: AttributeDef[]
): string {
  // Header row
  const headers = attributes.map((a) => escapeCSV(a.title));
  const lines = [headers.join(",")];

  // Data rows
  for (const record of records) {
    const cells = attributes.map((attr) => {
      const val = record.values[attr.slug];
      return escapeCSV(formatValue(val, attr));
    });
    lines.push(cells.join(","));
  }

  return lines.join("\n");
}

/** Trigger a file download in the browser */
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Excel Export ────────────────────────────────────────────────────

/**
 * Generate an .xlsx file from records and trigger a browser download.
 * Uses write-excel-file so Excel opens the file natively with a proper
 * header row, frozen header, and auto-sized columns.
 */
export async function downloadExcel(
  records: RecordRow[],
  attributes: AttributeDef[],
  filename: string
): Promise<void> {
  // Lazy-load so the xlsx writer is not in the initial JS bundle.
  const { default: writeXlsxFile } = await import("write-excel-file");

  // Header row — bold, grey background so it's clearly distinct from data.
  const headerRow = attributes.map((a) => ({
    value: a.title,
    fontWeight: "bold" as const,
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
    alignVertical: "center" as const,
  }));

  // Data rows
  const dataRows = records.map((record) =>
    attributes.map((attr) => {
      const val = record.values[attr.slug];
      const text = formatValue(val, attr);
      return {
        value: text,
        alignVertical: "center" as const,
        wrap: false,
      };
    })
  );

  // Rough auto-size: pick the longest cell in each column (cap between 14 and 60).
  const columnWidths = attributes.map((attr, colIdx) => {
    const headerLen = attr.title.length;
    const maxDataLen = records.reduce((max, r) => {
      const text = formatValue(r.values[attr.slug], attr);
      return Math.max(max, text.length);
    }, 0);
    const w = Math.min(60, Math.max(14, Math.max(headerLen, maxDataLen) + 2));
    return { width: w };
  });

  await writeXlsxFile([headerRow, ...dataRows], {
    fileName: filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
    columns: columnWidths,
    stickyRowsCount: 1, // freeze header
  });
}

// ─── CSV Import (Parsing) ───────────────────────────────────────────

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

/** Parse a CSV string into headers + rows */
export function parseCSV(text: string): ParsedCSV {
  const lines: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(cell);
        cell = "";
      } else if (ch === "\r" && next === "\n") {
        current.push(cell);
        cell = "";
        lines.push(current);
        current = [];
        i++; // skip \n
      } else if (ch === "\n") {
        current.push(cell);
        cell = "";
        lines.push(current);
        current = [];
      } else {
        cell += ch;
      }
    }
  }

  // Last cell/line
  if (cell || current.length > 0) {
    current.push(cell);
    lines.push(current);
  }

  // Filter out empty trailing lines
  while (lines.length > 0 && lines[lines.length - 1].every((c) => c === "")) {
    lines.pop();
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  return {
    headers: lines[0],
    rows: lines.slice(1),
  };
}
