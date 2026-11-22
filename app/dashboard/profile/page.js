import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import ProfileForm from "@/components/forms/ProfileForm";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Profile | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireRole(["RESIDENT"]);

  let profile = null;
  let loadError = false;
  try {
    await connectDB();
    // Always the signed-in resident's own record: the id comes from the server session.
    profile = await User.findById(user.id)
      .select("name email serviceZone createdAt")
      .populate("serviceZone", "name")
      .lean();
  } catch (err) {
    console.error("Load profile failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          You can change your name here. Your email cannot be changed on this page. Phone, address and photo are not
          part of this version.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Your profile could not be loaded. Please try again later.</ErrorNotice>
          </div>
        )}
      </section>

      {profile && (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Your name</h2>
            <ProfileForm name={profile.name} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Account details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-gray-600">Email</dt>
                <dd className="break-all">{profile.email}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Service zone</dt>
                <dd>
                  {profile.serviceZone ? profile.serviceZone.name : "Not chosen yet"}{" "}
                  <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Change</Link>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Member since</dt>
                <dd>{formatDateTime(profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Password</dt>
                <dd>
                  <Link href="/dashboard/settings" className="font-semibold text-emerald-800 underline">Change password</Link>
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
