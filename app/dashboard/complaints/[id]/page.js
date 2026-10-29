import PlaceholderPage from "@/components/ui/PlaceholderPage";

export const metadata = { title: "Complaint Details | ECO-CLEAN" };

export default function Page() {
  return <PlaceholderPage title="Complaint Details" route="/dashboard/complaints/[id]" access="Resident only" />;
}
