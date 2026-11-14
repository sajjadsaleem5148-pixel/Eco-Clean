const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/reportStatus.js",
  "lib/permissions/roles.js",
  "models/ServiceZone.js",
  "models/User.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/scheduleStatus.js", `
export const SCHEDULE_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED"];

export const SCHEDULE_STATUS_LABELS = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

// New status -> the statuses it may come from.
export const SCHEDULE_STATUS_FROM = {
  CONFIRMED: ["DRAFT"],
  CANCELLED: ["DRAFT", "CONFIRMED"],
};

export const SCHEDULE_TARGET_LABELS = {
  CONFIRMED: "Confirm schedule",
  CANCELLED: "Cancel schedule",
};

export const SCHEDULE_REASON_REQUIRED = ["CANCELLED"];

export function scheduleTargets(status) {
  return Object.keys(SCHEDULE_STATUS_FROM).filter((t) => SCHEDULE_STATUS_FROM[t].includes(status));
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayLabel(n) {
  return WEEKDAYS[n] || "-";
}

// 24-hour HH:MM
export const TIME_PATTERN = /^([01]\\d|2[0-3]):[0-5]\\d$/;

export function isValidTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isValidWindow(start, end) {
  return isValidTime(start) && isValidTime(end) && start < end;
}

// Two windows overlap only if each one starts before the other ends. Touching windows do not overlap.
export function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function formatWindow(start, end) {
  return start + " - " + end;
}
`);

write("tests/unit/scheduleStatus.test.js", `
import { describe, it, expect } from "vitest";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_STATUS_FROM,
  SCHEDULE_REASON_REQUIRED,
  WEEKDAYS,
  scheduleTargets,
  weekdayLabel,
  isValidTime,
  isValidWindow,
  windowsOverlap,
  formatWindow,
} from "@/lib/scheduleStatus";

describe("schedule status", () => {
  it("has a label for every status", () => {
    SCHEDULE_STATUSES.forEach((s) => expect(SCHEDULE_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses", () => {
    Object.entries(SCHEDULE_STATUS_FROM).forEach(([to, froms]) => {
      expect(SCHEDULE_STATUSES).toContain(to);
      froms.forEach((f) => expect(SCHEDULE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(scheduleTargets("DRAFT")).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(scheduleTargets("CONFIRMED")).toEqual(["CANCELLED"]);
    expect(scheduleTargets("CANCELLED")).toEqual([]);
    expect(scheduleTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to cancel", () => {
    expect(SCHEDULE_REASON_REQUIRED).toEqual(["CANCELLED"]);
  });
});

describe("weekdays", () => {
  it("has seven days starting on Sunday", () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(weekdayLabel(0)).toBe("Sunday");
    expect(weekdayLabel(6)).toBe("Saturday");
    expect(weekdayLabel(9)).toBe("-");
  });
});

describe("time windows", () => {
  it("accepts valid 24-hour times only", () => {
    ["00:00", "08:30", "23:59"].forEach((t) => expect(isValidTime(t)).toBe(true));
    ["24:00", "8:30", "12:60", "ab:cd", "", null, undefined].forEach((t) => expect(isValidTime(t)).toBe(false));
  });

  it("needs the end to be after the start", () => {
    expect(isValidWindow("08:00", "10:00")).toBe(true);
    expect(isValidWindow("10:00", "08:00")).toBe(false);
    expect(isValidWindow("08:00", "08:00")).toBe(false);
    expect(isValidWindow("08:00", "bad")).toBe(false);
  });

  it("detects overlapping windows and lets touching windows through", () => {
    expect(windowsOverlap("08:00", "10:00", "09:00", "11:00")).toBe(true);
    expect(windowsOverlap("08:00", "10:00", "08:30", "09:00")).toBe(true);
    expect(windowsOverlap("08:00", "10:00", "10:00", "12:00")).toBe(false);
    expect(windowsOverlap("08:00", "10:00", "06:00", "08:00")).toBe(false);
    expect(windowsOverlap("08:00", "10:00", "13:00", "15:00")).toBe(false);
  });

  it("formats a window", () => {
    expect(formatWindow("08:00", "10:00")).toBe("08:00 - 10:00");
  });
});
`);

write("models/CollectionSchedule.js", `
import mongoose from "mongoose";
import { SCHEDULE_STATUSES } from "@/lib/scheduleStatus";

const scheduleSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    // 0 = Sunday ... 6 = Saturday. A weekly recurring schedule.
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    collector: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: SCHEDULE_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelReason: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

scheduleSchema.index({ collector: 1, weekday: 1, status: 1 });

export default mongoose.models.CollectionSchedule || mongoose.model("CollectionSchedule", scheduleSchema);
`);

write("actions/schedules.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  TIME_PATTERN,
  SCHEDULE_STATUS_FROM,
  SCHEDULE_REASON_REQUIRED,
  isValidWindow,
} from "@/lib/scheduleStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a valid option");

function refresh() {
  revalidatePath("/admin/schedules");
  revalidatePath("/schedule");
}

const createSchema = z.object({
  zoneId: objectId,
  collectorId: objectId,
  weekday: z.coerce.number().int("Please choose a day").min(0, "Please choose a day").max(6, "Please choose a day"),
  startTime: z.string().regex(TIME_PATTERN, "Use a 24-hour time such as 08:00"),
  endTime: z.string().regex(TIME_PATTERN, "Use a 24-hour time such as 10:00"),
  note: z.string().trim().max(200, "Note is too long").optional(),
});

export async function createScheduleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    zoneId: formData.get("zoneId"),
    collectorId: formData.get("collectorId"),
    weekday: formData.get("weekday"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (!isValidWindow(d.startTime, d.endTime)) {
    return { error: "The end time must be after the start time." };
  }

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: d.zoneId, status: "ACTIVE", deletedAt: null }).select("_id").lean();
    if (!zone) return { error: "The selected zone is not available." };

    const collector = await User.findOne({
      _id: d.collectorId,
      role: "COLLECTOR",
      status: "ACTIVE",
      deletedAt: null,
    }).select("serviceZone");
    if (!collector) return { error: "The selected collector is not available." };
    if (!collector.serviceZone || collector.serviceZone.toString() !== d.zoneId) {
      return { error: "This collector is not assigned to the selected zone." };
    }

    const created = await CollectionSchedule.create({
      serviceZone: zone._id,
      weekday: d.weekday,
      startTime: d.startTime,
      endTime: d.endTime,
      collector: collector._id,
      note: d.note,
      status: "DRAFT",
      createdBy: user.id,
    });

    await writeAudit({
      actor: user.id,
      action: "schedule.create",
      targetType: "CollectionSchedule",
      targetId: created._id.toString(),
      metadata: { zone: d.zoneId, weekday: d.weekday, window: d.startTime + "-" + d.endTime },
    });
  } catch (err) {
    console.error("Create schedule failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Schedule saved as a draft. It is not shown to the public until you confirm it." };
}

const statusSchema = z.object({
  scheduleId: objectId,
  target: z.enum(["CONFIRMED", "CANCELLED"], { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

export async function setScheduleStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { scheduleId, target, reason } = parsed.data;

  if (SCHEDULE_REASON_REQUIRED.includes(target) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to cancel a schedule." };
  }

  try {
    await connectDB();
    const schedule = await CollectionSchedule.findById(scheduleId).lean();
    if (!schedule || !SCHEDULE_STATUS_FROM[target].includes(schedule.status)) {
      return { error: "This schedule cannot be moved to that status." };
    }

    const set = { status: target };

    if (target === "CONFIRMED") {
      // A schedule is confirmed only when a real, available collector is responsible for it.
      const zone = await ServiceZone.findOne({ _id: schedule.serviceZone, status: "ACTIVE", deletedAt: null })
        .select("_id")
        .lean();
      const collector = await User.findOne({
        _id: schedule.collector,
        role: "COLLECTOR",
        status: "ACTIVE",
        deletedAt: null,
      }).select("serviceZone");
      const sameZone =
        collector && collector.serviceZone && collector.serviceZone.toString() === schedule.serviceZone.toString();
      if (!zone || !collector || !sameZone) {
        return { error: "The collector is no longer available in this zone. Create a new schedule." };
      }

      const clash = await CollectionSchedule.findOne({
        _id: { $ne: schedule._id },
        collector: schedule.collector,
        weekday: schedule.weekday,
        status: "CONFIRMED",
        startTime: { $lt: schedule.endTime },
        endTime: { $gt: schedule.startTime },
      })
        .select("_id")
        .lean();
      if (clash) {
        return { error: "This collector already has a confirmed schedule that overlaps this time on that day." };
      }

      set.confirmedBy = user.id;
      set.confirmedAt = new Date();
    } else {
      set.cancelledBy = user.id;
      set.cancelReason = reason;
    }

    const updated = await CollectionSchedule.findOneAndUpdate(
      { _id: scheduleId, status: { $in: SCHEDULE_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This schedule cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "schedule." + target.toLowerCase(),
      targetType: "CollectionSchedule",
      targetId: scheduleId,
      reason: SCHEDULE_REASON_REQUIRED.includes(target) ? reason : undefined,
    });
  } catch (err) {
    console.error("Set schedule status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "CONFIRMED" ? "Schedule confirmed." : "Schedule cancelled." };
}
`);

write("components/forms/ScheduleForms.js", `
"use client";

import { useActionState, useState } from "react";
import { createScheduleAction, setScheduleStatusAction } from "@/actions/schedules";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const dangerButton = "min-h-11 rounded-md bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50";

function Feedback({ state }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
    </>
  );
}

// zones: [{ id, name }]   collectors: [{ id, name, zoneId }]   weekdays: [{ value, label }]
export function ScheduleForm({ zones, collectors, weekdays }) {
  const [state, formAction, pending] = useActionState(createScheduleAction, null);
  const [zoneId, setZoneId] = useState("");
  const options = collectors.filter((c) => c.zoneId === zoneId);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="sc-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="sc-zone" name="zoneId" required value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sc-collector" className="mb-1 block text-sm font-medium">Responsible collector (same zone only)</label>
        <select id="sc-collector" name="collectorId" required defaultValue="" disabled={!zoneId} className={field}>
          <option value="" disabled>{zoneId ? "Select a collector" : "Choose a zone first"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {zoneId && options.length === 0 && (
          <p className="mt-1 text-sm text-amber-900">No active collector is assigned to this zone yet.</p>
        )}
      </div>
      <div>
        <label htmlFor="sc-day" className="mb-1 block text-sm font-medium">Day of the week (repeats weekly)</label>
        <select id="sc-day" name="weekday" required defaultValue="" className={field}>
          <option value="" disabled>Select a day</option>
          {weekdays.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sc-start" className="mb-1 block text-sm font-medium">Window starts (24-hour)</label>
          <input id="sc-start" name="startTime" type="time" required className={field} />
        </div>
        <div>
          <label htmlFor="sc-end" className="mb-1 block text-sm font-medium">Window ends (24-hour)</label>
          <input id="sc-end" name="endTime" type="time" required className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="sc-note" className="mb-1 block text-sm font-medium">Note (optional)</label>
        <input id="sc-note" name="note" type="text" maxLength={200} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save schedule (draft)"}
      </button>
    </form>
  );
}

export function ConfirmScheduleForm({ scheduleId }) {
  const [state, formAction, pending] = useActionState(setScheduleStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="target" value="CONFIRMED" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Confirming..." : "Confirm schedule"}
      </button>
    </form>
  );
}

export function CancelScheduleForm({ scheduleId }) {
  const [state, formAction, pending] = useActionState(setScheduleStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="target" value="CANCELLED" />
      <div>
        <label htmlFor={"cancel-" + scheduleId} className="mb-1 block text-sm font-medium">
          Reason for cancelling (at least 10 characters)
        </label>
        <input id={"cancel-" + scheduleId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Cancelling..." : "Cancel schedule"}
      </button>
    </form>
  );
}
`);

write("app/admin/(panel)/schedules/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  WEEKDAYS,
  scheduleTargets,
  weekdayLabel,
  formatWindow,
} from "@/lib/scheduleStatus";
import { ScheduleForm, ConfirmScheduleForm, CancelScheduleForm } from "@/components/forms/ScheduleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Collection Schedules | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/schedules" + (status ? "?status=" + status : "");
}

export default async function AdminSchedulesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = SCHEDULE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = {};
  if (status) filter.status = status;

  let schedules = [];
  let zones = [];
  let collectors = [];
  let loadError = false;
  try {
    await connectDB();
    const [s, z, c] = await Promise.all([
      CollectionSchedule.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("serviceZone", "name")
        .populate("collector", "name")
        .lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
      User.find({ role: "COLLECTOR", status: "ACTIVE", deletedAt: null, serviceZone: { $ne: null } })
        .sort({ name: 1 })
        .select("name serviceZone")
        .lean(),
    ]);
    schedules = s;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    collectors = c.map((x) => ({ id: x._id.toString(), name: x.name, zoneId: x.serviceZone.toString() }));
  } catch (err) {
    console.error("Load schedules failed:", err.message);
    loadError = true;
  }

  const weekdays = WEEKDAYS.map((label, value) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    SCHEDULE_STATUSES.map((s) => ({ label: SCHEDULE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Collection Schedules</h1>
        <p className="mt-1 text-sm text-gray-600">
          A schedule is public only after it is confirmed with a responsible collector. Holidays, service interruptions
          and teams or vehicles are not part of this version.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Schedules could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && schedules.length === 0 && (
          <div className="mt-4">
            <EmptyState>No schedules match this filter.</EmptyState>
          </div>
        )}

        {schedules.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Day</th>
                  <th scope="col" className="py-2 pr-4">Window</th>
                  <th scope="col" className="py-2 pr-4">Collector</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const id = s._id.toString();
                  const targets = scheduleTargets(s.status);
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{s.serviceZone ? s.serviceZone.name : "-"}</td>
                      <td className="py-2 pr-4">{weekdayLabel(s.weekday)}</td>
                      <td className="py-2 pr-4">{formatWindow(s.startTime, s.endTime)}</td>
                      <td className="py-2 pr-4">{s.collector ? s.collector.name : "-"}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={s.status} label={SCHEDULE_STATUS_LABELS[s.status]} />
                        {s.status === "CANCELLED" && s.cancelReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {s.cancelReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {targets.includes("CONFIRMED") && <ConfirmScheduleForm scheduleId={id} />}
                        {targets.includes("CANCELLED") && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm font-semibold text-red-800">Cancel</summary>
                            <CancelScheduleForm scheduleId={id} />
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a schedule</h2>
        {zones.length === 0 ? (
          <EmptyState>
            No active zones. <Link href="/admin/zones" className="font-semibold text-emerald-800 underline">Create a zone</Link> first.
          </EmptyState>
        ) : (
          <ScheduleForm zones={zones} collectors={collectors} weekdays={weekdays} />
        )}
      </section>
    </div>
  );
}
`);

write("app/(public)/schedule/page.js", `
import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import "@/models/ServiceZone";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Collection Schedule | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    // Only confirmed schedules are public. The collector's name is never selected.
    const all = await CollectionSchedule.find({ status: "CONFIRMED" })
      .populate({ path: "serviceZone", select: "name status deletedAt" })
      .select("serviceZone weekday startTime endTime")
      .lean();
    schedules = all.filter((s) => s.serviceZone && s.serviceZone.status === "ACTIVE" && !s.serviceZone.deletedAt);
  } catch (err) {
    console.error("Load public schedule failed:", err.message);
    loadError = true;
  }

  const byZone = {};
  schedules.forEach((s) => {
    const name = s.serviceZone.name;
    if (!byZone[name]) byZone[name] = [];
    byZone[name].push(s);
  });
  const zoneNames = Object.keys(byZone).sort();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Collection Schedule</h1>
      <p className="mt-2 text-sm text-gray-700">
        Only schedules that staff have confirmed with a responsible collector are listed here. Times are a service
        target, not a guarantee, and can change because of staff, vehicle or disposal capacity.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>The schedule is temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && zoneNames.length === 0 && (
        <div className="mt-6">
          <EmptyState>No collection schedules have been confirmed yet.</EmptyState>
        </div>
      )}

      {zoneNames.length > 0 && (
        <div className="mt-6 space-y-6">
          {zoneNames.map((name) => (
            <section key={name} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{name}</h2>
              <ul className="mt-3 space-y-1 text-sm text-gray-800">
                {byZone[name]
                  .slice()
                  .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
                  .map((s) => (
                    <li key={s._id.toString()}>
                      {weekdayLabel(s.weekday)}: {formatWindow(s.startTime, s.endTime)}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
`);

write("tests/integration/schedules.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createScheduleAction, setScheduleStatusAction } from "@/actions/schedules";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

async function makeZone(name) {
  return ServiceZone.create({ name: name, slug: name.toLowerCase().replace(/ /g, "-") });
}

async function world() {
  const zone = await makeZone("Zone A");
  const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
  const manager = await makeUser({ role: "OPERATIONS_MANAGER" });
  return { zone, collector, manager };
}

function createForm(w, overrides) {
  return form(
    Object.assign(
      {
        zoneId: String(w.zone._id),
        collectorId: String(w.collector._id),
        weekday: "1",
        startTime: "08:00",
        endTime: "10:00",
      },
      overrides || {}
    )
  );
}

function statusForm(id, target, reason) {
  return form({ scheduleId: String(id), target: target, reason: reason });
}

async function draft(w, overrides) {
  signInAs(w.manager);
  await run(() => createScheduleAction(null, createForm(w, overrides)));
  const all = await CollectionSchedule.find({}).sort({ _id: 1 }).lean();
  return all[all.length - 1];
}

describe("createScheduleAction", () => {
  it("saves a draft for a collector of the same zone", async () => {
    const w = await world();
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w)));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionSchedule.find({}).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("DRAFT");
    expect(saved[0].weekday).toBe(1);
  });

  it("refuses a collector from another zone", async () => {
    const w = await world();
    const other = await makeZone("Zone B");
    const stranger = await makeUser({ role: "COLLECTOR", serviceZone: other._id });
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w, { collectorId: String(stranger._id) })));
    expect(out.result.error).toMatch(/not assigned to the selected zone/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses an end time that is not after the start time", async () => {
    const w = await world();
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w, { startTime: "10:00", endTime: "08:00" })));
    expect(out.result.error).toMatch(/after the start/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a malformed time and an invalid weekday", async () => {
    const w = await world();
    signInAs(w.manager);
    const a = await run(() => createScheduleAction(null, createForm(w, { startTime: "25:00" })));
    expect(a.result.error).toMatch(/24-hour/i);
    const b = await run(() => createScheduleAction(null, createForm(w, { weekday: "9" })));
    expect(b.result.error).toMatch(/day/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a suspended collector and an inactive zone", async () => {
    const w = await world();
    await User.updateOne({ _id: w.collector._id }, { $set: { status: "SUSPENDED" } });
    signInAs(w.manager);
    const a = await run(() => createScheduleAction(null, createForm(w)));
    expect(a.result.error).toMatch(/not available/i);

    await User.updateOne({ _id: w.collector._id }, { $set: { status: "ACTIVE" } });
    await ServiceZone.updateOne({ _id: w.zone._id }, { $set: { status: "INACTIVE" } });
    const b = await run(() => createScheduleAction(null, createForm(w)));
    expect(b.result.error).toMatch(/not available/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a complaints manager, a resident and a visitor", async () => {
    const w = await world();
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });
    const resident = await makeUser();

    signInAs(complaints);
    const a = await run(() => createScheduleAction(null, createForm(w)));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(resident);
    const b = await run(() => createScheduleAction(null, createForm(w)));
    expect(b.result.error).toMatch(/permission/i);
    signOut();
    const c = await run(() => createScheduleAction(null, createForm(w)));
    expect(c.result.error).toMatch(/permission/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });
});

describe("setScheduleStatusAction", () => {
  it("confirms a draft once and records who confirmed it", async () => {
    const w = await world();
    const s = await draft(w);
    const first = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(first.result.success).toBeTruthy();
    const saved = await CollectionSchedule.findById(s._id).lean();
    expect(saved.status).toBe("CONFIRMED");
    expect(String(saved.confirmedBy)).toBe(String(w.manager._id));

    const again = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses a confirmed schedule that overlaps another one for the same collector and day", async () => {
    const w = await world();
    const a = await draft(w, { startTime: "08:00", endTime: "10:00" });
    const b = await draft(w, { startTime: "09:00", endTime: "11:00" });
    const okA = await run(() => setScheduleStatusAction(null, statusForm(a._id, "CONFIRMED")));
    expect(okA.result.success).toBeTruthy();
    const clash = await run(() => setScheduleStatusAction(null, statusForm(b._id, "CONFIRMED")));
    expect(clash.result.error).toMatch(/overlaps/i);
    expect((await CollectionSchedule.findById(b._id).lean()).status).toBe("DRAFT");
  });

  it("allows windows that only touch, and the same window on another day", async () => {
    const w = await world();
    const a = await draft(w, { startTime: "08:00", endTime: "10:00" });
    const touching = await draft(w, { startTime: "10:00", endTime: "12:00" });
    const otherDay = await draft(w, { weekday: "2", startTime: "08:00", endTime: "10:00" });
    for (const s of [a, touching, otherDay]) {
      const out = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
      expect(out.result.success).toBeTruthy();
    }
  });

  it("does not confirm when the collector became unavailable after the draft was saved", async () => {
    const w = await world();
    const s = await draft(w);
    await User.updateOne({ _id: w.collector._id }, { $set: { status: "SUSPENDED" } });
    const out = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(out.result.error).toMatch(/no longer available/i);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");
  });

  it("needs a real reason to cancel, and a cancelled schedule cannot be confirmed", async () => {
    const w = await world();
    const s = await draft(w);
    const none = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CANCELLED")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CANCELLED", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");

    const ok = await run(() =>
      setScheduleStatusAction(null, statusForm(s._id, "CANCELLED", "The route was merged into another one"))
    );
    expect(ok.result.success).toBeTruthy();
    const saved = await CollectionSchedule.findById(s._id).lean();
    expect(saved.status).toBe("CANCELLED");
    expect(saved.cancelReason).toBe("The route was merged into another one");

    const back = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(back.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses a resident and a complaints manager", async () => {
    const w = await world();
    const s = await draft(w);
    const resident = await makeUser();
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });

    signInAs(resident);
    const a = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(complaints);
    const b = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(b.result.error).toMatch(/permission/i);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    const checks = (src.match(/requireActionPermission\(/g) || []).length;
    if (checks < 2) problems.push("every action must check permission (found " + checks + ")");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient/.test(src)) {
    problems.push("animation or gradient classes are not allowed");
  }
  if (f === "app/(public)/schedule/page.js") {
    if (!src.includes('status: "CONFIRMED"')) problems.push("public page must list confirmed schedules only");
    if (/collector"/.test(src) || /populate\("collector/.test(src)) problems.push("public page must not load the collector");
  }
  if (f.startsWith("app/admin/") && !src.includes("requirePermission(")) problems.push("missing page permission check");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");