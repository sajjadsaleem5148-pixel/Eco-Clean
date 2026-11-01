import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

export function homeForRole(role) {
  if (role === "RESIDENT") return "/dashboard";
  if (role === "COLLECTOR") return "/collector";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/";
}

export async function getRoleByEmail(email) {
  await connectDB();
  const user = await User.findOne({ email, deletedAt: null }).select("role").lean();
  return user ? user.role : null;
}
