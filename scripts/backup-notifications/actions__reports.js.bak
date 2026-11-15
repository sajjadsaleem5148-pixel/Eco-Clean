"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import WasteCategory from "@/models/WasteCategory";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import { CLOSED_STATUSES } from "@/lib/reportStatus";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Please choose a valid option");

const reportSchema = z.object({
  category: objectId,
  serviceZone: objectId,
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  address: z.string().trim().min(5, "Please enter the pickup address").max(300),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid form. Please reload the page."),
});

const MAX_REPORTS_PER_HOUR = 5;
const DUPLICATE_WINDOW_HOURS = 48;

function makeReportId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "ECR-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function createReportAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "Please log in with a resident account to submit a report." };
  }

  const parsed = reportSchema.safeParse({
    category: formData.get("category"),
    serviceZone: formData.get("serviceZone"),
    description: formData.get("description"),
    address: formData.get("address"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  let reportId = null;

  try {
    await connectDB();

    const existing = await WasteReport.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
      .select("reportId").lean();
    if (existing) {
      reportId = existing.reportId;
    } else {
      const [category, zone] = await Promise.all([
        WasteCategory.findOne({ _id: d.category, status: "ACTIVE" }).lean(),
        ServiceZone.findOne({ _id: d.serviceZone, status: "ACTIVE", deletedAt: null }).lean(),
      ]);
      if (!category || !zone) {
        return { error: "The selected category or zone is not available." };
      }

      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await WasteReport.countDocuments({ reporter: user.id, createdAt: { $gte: hourAgo } });
      if (recent >= MAX_REPORTS_PER_HOUR) {
        return { error: "You have submitted too many reports in the last hour. Please try again later." };
      }

      const addressKey = d.address.toLowerCase().replace(/\s+/g, " ").trim();
      const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
      const duplicate = await WasteReport.findOne({
        serviceZone: zone._id,
        category: category._id,
        addressKey,
        status: { $nin: CLOSED_STATUSES },
        createdAt: { $gte: since },
      }).select("_id").lean();

      try {
        const created = await WasteReport.create({
          reportId: makeReportId(),
          reporter: user.id,
          category: category._id,
          serviceZone: zone._id,
          description: d.description,
          address: d.address,
          addressKey,
          idempotencyKey: d.idempotencyKey,
          possibleDuplicateOf: duplicate ? duplicate._id : undefined,
          statusHistory: [{ status: "SUBMITTED", by: user.id, note: "Report submitted by resident" }],
        });
        reportId = created.reportId;
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey) {
          const again = await WasteReport.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
            .select("reportId").lean();
          if (again) reportId = again.reportId;
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Create report failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  if (!reportId) return { error: "Something went wrong. Please try again." };
  redirect("/dashboard/reports/" + reportId);
}
