import PortalShell from "@/components/layout/PortalShell";
import { residentNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";

export default async function ResidentLayout({ children }) {
  await requireRole(["RESIDENT"]);
  return <PortalShell title="Resident Portal" groups={residentNav}>{children}</PortalShell>;
}
