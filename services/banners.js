import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import { campaignPhase } from "@/lib/campaignRules";
import { MAX_PUBLIC_BANNERS, DEFAULT_LINK_LABEL, safeBannerLink, isInternalLink } from "@/lib/bannerRules";

// For public pages: published banners that are running now, at most MAX_PUBLIC_BANNERS.
// The link is checked again here, so an unsafe link stored directly in the database is never shown.
export async function listPublicBanners(now) {
  await connectDB();
  const list = await Banner.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ sortOrder: 1, publishedAt: -1 })
    .limit(50)
    .select("title text linkUrl linkLabel startDate endDate")
    .lean();

  return list
    .filter((b) => campaignPhase(b, now) === "ACTIVE")
    .slice(0, MAX_PUBLIC_BANNERS)
    .map((b) => {
      const link = safeBannerLink(b.linkUrl);
      return {
        id: b._id.toString(),
        title: b.title,
        text: b.text,
        linkUrl: link || "",
        linkLabel: link ? b.linkLabel || DEFAULT_LINK_LABEL : "",
        internal: link ? isInternalLink(link) : false,
      };
    });
}
