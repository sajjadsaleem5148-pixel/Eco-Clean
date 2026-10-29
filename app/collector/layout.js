import PortalShell from "@/components/layout/PortalShell";
import { collectorNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";

export default async function CollectorLayout({ children }) {
  await requireRole(["COLLECTOR"]);
  return <PortalShell title="Collector Portal" groups={collectorNav}>{children}</PortalShell>;
}
