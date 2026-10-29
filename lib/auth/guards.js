import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/roles";

export async function requireRole(allowedRoles, loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  if (!allowedRoles.includes(user.role)) redirect("/");
  return user;
}

export async function requireUser(loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}

export async function requirePermission(permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!hasPermission(user.role, permission)) redirect("/admin");
  return user;
}

export async function requireActionPermission(permission) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, permission)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
