const mongoose = require("mongoose");

const pickupSchema = new mongoose.Schema(
  {
    // User jis ne pickup request ki
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Waste ka type
    wasteType: {
      type: String,
      enum: [
        "Organic",
        "Recyclable",
        "General",
      ],
      required: true,
    },

    // User ne waste properly separate kiya hai ya nahi
    isSeparated: {
      type: Boolean,
      default: false,
    },

    // Waste ki additional information
    wasteDescription: {
      type: String,
      default: "",
      trim: true,
    },

    // Waste ki image
    image: {
      type: String,
      default: "",
    },

    // Pickup address
    address: {
      type: String,
      required: true,
      trim: true,
    },

    // User phone
    phone: {
      type: String,
      default: "",
    },

    // Pickup date
    pickupDate: {
      type: Date,
      required: true,
    },

    // Pickup time
    pickupTime: {
      type: String,
      required: true,
    },

    // Pickup status
    status: {
      type: String,
      enum: [
        "Pending",
        "Assigned",
        "On the Way",
        "Collected",
        "Completed",
        "Rejected",
        "Cancelled",
      ],
      default: "Pending",
    },

    // Collector assigned by admin
    collector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Admin/collector notes
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Pickup ||
  mongoose.model("Pickup", pickupSchema);