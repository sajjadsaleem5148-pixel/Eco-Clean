import PlaceholderPage from "@/components/ui/PlaceholderPage";

export const metadata = { title: "Job Details | ECO-CLEAN" };

export default function Page() {
  return <PlaceholderPage title="Job Details" route="/collector/jobs/[id]" access="Collector only" />;
}
