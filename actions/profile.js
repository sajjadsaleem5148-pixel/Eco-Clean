"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { getCurrentUser } from "@/lib/auth/session";
import { NAME_MIN, NAME_MAX, normalizeDisplayName, isValidDisplayName } from "@/lib/profileRules";

export async function updateProfileAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "You do not have permission to do this." };
  }

  // Only the name is read from the form. Any other field that is sent is ignored.
  const name = normalizeDisplayName(String(formData.get("name") || ""));
  if (name.length < NAME_MIN) return { error: "Name must be at least " + NAME_MIN + " characters" };
  if (name.length > NAME_MAX) return { error: "Name is too long (" + NAME_MAX + " characters maximum)" };
  if (!isValidDisplayName(name)) {
    return { error: "Enter a valid name. It needs a letter or number and no < or > characters." };
  }

  try {
    await connectDB();
    // The id comes from the server session, never from the form.
    const res = await User.updateOne(
      { _id: user.id, role: "RESIDENT", status: "ACTIVE", deletedAt: null },
      { $set: { name: name } }
    );
    if (res.matchedCount === 0) return { error: "Your account could not be found." };
  } catch (err) {
    console.error("Update profile failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: "Your name was saved. It may take until your next login to show in the header." };
}
