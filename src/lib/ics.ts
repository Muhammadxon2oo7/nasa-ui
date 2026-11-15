import type { CalendarEvent } from "@/types/api";

const d8 = (iso: string) => iso.replaceAll("-", "");
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** RFC 5545 all-day events (B1 .ics export). */
export function toIcs(events: CalendarEvent[], name: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Field Shift UZ//Calendar//UZ", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    const end = new Date(`${e.endDate ?? e.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${e.id}-${d8(e.date)}@fieldshift.uz`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(end.toISOString().slice(0, 10))}`, `SUMMARY:${esc(e.title)}`, ...(e.detail ? [`DESCRIPTION:${esc(`${e.detail} (${e.source})`)}`] : [`DESCRIPTION:${esc(e.source)}`]), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
