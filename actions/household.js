"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";

const schema = z.object({
  zoneId: z.string().regex(/^[a-f\d]{24}$/i, "Please choose a zone"),
});

export async function saveZoneAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({ zoneId: formData.get("zoneId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: parsed.data.zoneId, status: "ACTIVE", deletedAt: null })
      .select("_id")
      .lean();
    if (!zone) return { error: "The selected zone is not available." };

    // The id comes from the server session, never from the form.
    await User.updateOne({ _id: user.id, deletedAt: null }, { $set: { serviceZone: zone._id } });
  } catch (err) {
    console.error("Save zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/household");
  revalidatePath("/dashboard/collections");
  return { success: "Your service zone was saved." };
}
