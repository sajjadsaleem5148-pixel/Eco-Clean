import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import HouseholdForm from "@/components/forms/HouseholdForm";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Household | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function HouseholdPage() {
  const user = await requireRole(["RESIDENT"]);

  let zones = [];
  let currentId = "";
  let loadError = false;
  try {
    await connectDB();
    const [list, me] = await Promise.all([
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
      User.findById(user.id).select("serviceZone").lean(),
    ]);
    zones = list.map((z) => ({ id: z._id.toString(), name: z.name }));
    if (me && me.serviceZone) currentId = me.serviceZone.toString();
  } catch (err) {
    console.error("Load household failed:", err.message);
    loadError = true;
  }

  const currentIsActive = zones.some((z) => z.id === currentId);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Household</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your service zone decides which confirmed collection schedule you see. Choose the zone where your household is.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your household could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && currentId && !currentIsActive && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Your saved zone is no longer active. Please choose another zone.
        </p>
      )}
      {!loadError && zones.length === 0 && (
        <div className="mt-4">
          <EmptyState>No service zones are available yet.</EmptyState>
        </div>
      )}
      {!loadError && zones.length > 0 && (
        <div className="mt-4">
          <HouseholdForm zones={zones} currentId={currentIsActive ? currentId : ""} />
        </div>
      )}
    </section>
  );
}
