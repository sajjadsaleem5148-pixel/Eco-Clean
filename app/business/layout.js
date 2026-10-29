import PortalShell from "@/components/layout/PortalShell";
import { businessNav } from "@/lib/navigation";
import { requireUser } from "@/lib/auth/guards";

// Business ka alag role abhi tay nahi hua, is liye filhal sirf login zaroori hai.
export default async function BusinessLayout({ children }) {
  await requireUser();
  return <PortalShell title="Business Portal" groups={businessNav}>{children}</PortalShell>;
}
