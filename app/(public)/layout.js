import Link from "next/link";
import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";
import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";
import { listPublicBanners } from "@/services/banners";

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

// A banner problem must never stop the public pages from opening.
async function loadBanners() {
  try {
    return await listPublicBanners();
  } catch (err) {
    console.error("Load banners failed:", err.message);
    return [];
  }
}

const linkClass = "ml-2 font-semibold text-emerald-900 underline";

export default async function PublicLayout({ children }) {
  const [announcements, banners] = await Promise.all([loadAnnouncements(), loadBanners()]);

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
      {banners.length > 0 && (
        <section aria-label="Featured notices" className="border-b border-gray-200 bg-white">
          <ul className="mx-auto max-w-6xl space-y-2 px-4 py-3">
            {banners.map((b) => (
              <li key={b.id} className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
                <span className="font-semibold">{b.title}</span> {b.text}
                {b.linkUrl && b.internal && (
                  <Link href={b.linkUrl} className={linkClass}>{b.linkLabel}</Link>
                )}
                {b.linkUrl && !b.internal && (
                  <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{b.linkLabel}</a>
                )}
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
