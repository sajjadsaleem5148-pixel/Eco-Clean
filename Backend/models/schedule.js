const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
  {
    area: {
      type: String,
      required: true,
      trim: true,
    },

    day: {
      type: String,
      required: true,
    },

    collectionTime: {
      type: String,
      required: true,
    },

    wasteTypes: [
      {
        type: String,
      },
    ],

    collector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Schedule", scheduleSchema);