import ContactForm from "@/components/forms/ContactForm";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";

export const metadata = { title: "Contact | ECO-CLEAN" };

export default function ContactPage() {
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Contact us</h1>
      <p className="mt-2 text-sm text-gray-700">
        Send us a message and a staff member will review it. For missed pickups or other service problems,
        please use the Complaints page so you get a ticket you can track.
      </p>
      <p className="mt-2 text-sm text-gray-700">
        Public phone numbers and addresses will appear in the footer once an administrator configures them.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <ContactForm categories={categories} />
      </div>
    </main>
  );
}
