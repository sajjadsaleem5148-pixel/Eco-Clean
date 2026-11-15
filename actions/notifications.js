"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/auth/session";

function refresh() {
  revalidatePath("/dashboard/notifications");
  revalidatePath("/collector/notifications");
  revalidatePath("/admin/notifications");
}

const idSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid notification") });

export async function markReadAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    // The owner filter comes from the server session, so nobody can mark another person's notification.
    const res = await Notification.updateOne(
      { _id: parsed.data.id, user: user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    if (res.matchedCount === 0) {
      const exists = await Notification.exists({ _id: parsed.data.id, user: user.id });
      if (!exists) return { error: "Notification not found." };
    }
  } catch (err) {
    console.error("Mark read failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Marked as read." };
}

export async function markAllReadAction() {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };

  try {
    await connectDB();
    await Notification.updateMany({ user: user.id, readAt: null }, { $set: { readAt: new Date() } });
  } catch (err) {
    console.error("Mark all read failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "All notifications marked as read." };
}
