import { requirePermission } from "@/lib/auth/guards";
import { getSettingsForEdit } from "@/services/siteSettings";
import { SOCIAL_FIELDS } from "@/lib/siteSettings";
import SettingsForm from "@/components/forms/SettingsForm";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "General Settings | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");

  let values = null;
  let loadError = false;
  try {
    values = await getSettingsForEdit();
  } catch (err) {
    console.error("Load settings failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        These contact details are shown publicly in the footer and on the Contact page. Leave a field empty to hide it.
        Only enter details that are real and approved. Logo, colours, timezone and maintenance mode are not part of
        this version.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Settings could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {values && (
        <div className="mt-4">
          <SettingsForm values={values} socials={SOCIAL_FIELDS} />
        </div>
      )}
    </section>
  );
}
