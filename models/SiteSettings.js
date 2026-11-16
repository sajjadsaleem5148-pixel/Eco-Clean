import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    contactEmail: { type: String, trim: true, maxlength: 200 },
    contactPhone: { type: String, trim: true, maxlength: 25 },
    address: { type: String, trim: true, maxlength: 300 },
    openingHours: { type: String, trim: true, maxlength: 200 },
    facebookUrl: { type: String, trim: true, maxlength: 200 },
    instagramUrl: { type: String, trim: true, maxlength: 200 },
    xUrl: { type: String, trim: true, maxlength: 200 },
    linkedinUrl: { type: String, trim: true, maxlength: 200 },
    youtubeUrl: { type: String, trim: true, maxlength: 200 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.SiteSettings || mongoose.model("SiteSettings", settingsSchema);
