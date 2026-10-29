import PortalShell from "@/components/layout/PortalShell";
import { adminNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

export default async function AdminLayout({ children }) {
  await requireRole(ADMIN_ROLES, "/admin/login");
  return <PortalShell title="Control Center" groups={adminNav}>{children}</PortalShell>;
}
