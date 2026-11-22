import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import { MAX_PUBLIC_TESTIMONIALS } from "@/lib/testimonialRules";

// For the public page. Only published testimonials with recorded consent are read,
// and only the three public fields are selected.
export async function listPublicTestimonials() {
  await connectDB();
  const list = await Testimonial.find({ status: "PUBLISHED", consentConfirmed: true, deletedAt: null })
    .sort({ sortOrder: 1, publishedAt: -1 })
    .limit(MAX_PUBLIC_TESTIMONIALS)
    .select("quote authorName authorDetail")
    .lean();

  return list.map((t) => ({
    id: t._id.toString(),
    quote: t.quote,
    authorName: t.authorName,
    authorDetail: t.authorDetail || "",
  }));
}
