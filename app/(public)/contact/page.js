import ContactForm from "@/components/forms/ContactForm";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";
import { getContactSettings } from "@/services/siteSettings";
import { telHref } from "@/lib/siteSettings";

export const metadata = { title: "Contact | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const c = await getContactSettings();
  const hasDetails = Boolean(c.email || c.phone || c.address || c.hours);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Contact us</h1>
      <p className="mt-2 text-sm text-gray-700">
        Send us a message and a staff member will review it. For missed pickups or other service problems,
        please use the Complaints page so you get a ticket you can track.
      </p>

      {hasDetails ? (
        <section aria-label="Contact details" className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
          <ul className="space-y-1">
            {c.email && (
              <li>Email: <a href={"mailto:" + c.email} className="font-semibold text-emerald-800 underline">{c.email}</a></li>
            )}
            {c.phone && (
              <li>Phone: <a href={telHref(c.phone)} className="font-semibold text-emerald-800 underline">{c.phone}</a></li>
            )}
            {c.address && <li className="whitespace-pre-line">Address: {c.address}</li>}
            {c.hours && <li>Opening hours: {c.hours}</li>}
          </ul>
        </section>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          Public phone numbers and addresses will appear here once an administrator configures them.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <ContactForm categories={categories} />
      </div>
    </main>
  );
}
