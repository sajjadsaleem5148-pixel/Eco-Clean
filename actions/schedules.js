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

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Please choose a valid option");

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
