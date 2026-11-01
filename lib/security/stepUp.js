import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { hit, makeKey } from "@/lib/security/rateLimit";

export async function verifyCurrentPassword(userId, password) {
  if (!password) return { ok: false, reason: "INVALID" };
  const rl = await hit(makeKey("stepup", userId), 10, 15 * 60);
  if (!rl.ok) return { ok: false, reason: "LIMITED" };

  await connectDB();
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user) return { ok: false, reason: "INVALID" };
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? { ok: true } : { ok: false, reason: "INVALID" };
}
