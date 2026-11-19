import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import { campaignPhase } from "@/lib/campaignRules";

const RANK = { ACTIVE: 0, UPCOMING: 1 };

// For the public page: only published campaigns that have not ended. Running ones come first.
export async function listPublicCampaigns(now) {
  await connectDB();
  const list = await Campaign.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ publishedAt: -1 })
    .limit(100)
    .select("title summary body startDate endDate")
    .lean();

  return list
    .map((c) => ({
      id: c._id.toString(),
      title: c.title,
      summary: c.summary,
      body: c.body || "",
      startDate: c.startDate || "",
      endDate: c.endDate || "",
      phase: campaignPhase(c, now),
    }))
    .filter((c) => c.phase !== "ENDED")
    .sort((a, b) => RANK[a.phase] - RANK[b.phase]);
}
