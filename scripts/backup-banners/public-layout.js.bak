import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";
import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";

export const dynamic = "force-dynamic";

async function loadAnnouncements() {
  try {
    await connectDB();
    return await Announcement.find({ status: "PUBLISHED", deletedAt: null })
      .sort({ publishedAt: -1 })
      .limit(2)
      .select("title body")
      .lean();
  } catch (err) {
    console.error("Load announcements failed:", err.message);
    return [];
  }
}

export default async function PublicLayout({ children }) {
  const announcements = await loadAnnouncements();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {announcements.length > 0 && (
        <section aria-label="Announcements" className="border-b border-emerald-200 bg-emerald-50">
          <ul className="mx-auto max-w-6xl space-y-1 px-4 py-2 text-sm text-emerald-950">
            {announcements.map((a) => (
              <li key={a._id.toString()}>
                <span className="font-semibold">{a.title}:</span> {a.body}
              </li>
            ))}
          </ul>
        </section>
      )}
      <PublicNavbar />
      {children}
      <Footer />
    </div>
  );
}
