const Pickup = require("../models/Pickup");

// ===============================
// CREATE PICKUP REQUEST
// ===============================
const createPickup = async (req, res) => {
  try {
    const {
      wasteType,
      isSeparated,
      wasteDescription,
      address,
      phone,
      pickupDate,
      pickupTime,
      notes,
    } = req.body;

    // Required fields
    if (
      !wasteType ||
      isSeparated === undefined ||
      !address ||
      !pickupDate ||
      !pickupTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields",
      });
    }

    // Mixed waste is not accepted
    if (isSeparated !== true && isSeparated !== "true") {
      return res.status(400).json({
        success: false,
        message:
          "Pickup rejected. Please separate your waste into the correct bins.",
      });
    }

    const pickup = await Pickup.create({
      user: req.user._id,
      wasteType,
      isSeparated: true,
      wasteDescription: wasteDescription || "",
      image: req.file ? `/uploads/${req.file.filename}` : "",
      address,
      phone: phone || "",
      pickupDate,
      pickupTime,
      notes: notes || "",
      status: "Pending",
    });

    res.status(201).json({
      success: true,
      message: "Pickup request created successfully",
      pickup,
    });
  } catch (error) {
    console.error("Create Pickup Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to create pickup request",
    });
  }
};

// ===============================
// GET MY PICKUPS
// ===============================
const getMyPickups = async (req, res) => {
  try {
    const pickups = await Pickup.find({
      user: req.user._id,
    })
      .populate("collector", "name phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pickups.length,
      pickups,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// GET ALL PICKUPS - ADMIN
// ===============================
const getAllPickups = async (req, res) => {
  try {
    const pickups = await Pickup.find()
      .populate("user", "name email phone address")
      .populate("collector", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pickups.length,
      pickups,
    });
  } catch (error) {
    console.error("Get All Pickups Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ===============================
// GET SINGLE PICKUP
// ===============================
const getPickupById = async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id)
      .populate("user", "name email phone address")
      .populate("collector", "name phone");

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: "Pickup not found",
      });
    }

    res.status(200).json({
      success: true,
      pickup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ASSIGN PICKUP TO COLLECTOR
const assignPickup = async (req, res) => {
  try {
    const { collectorId } = req.body;

    if (!collectorId) {
      return res.status(400).json({
        success: false,
        message: "Collector ID is required",
      });
    }

    const pickup = await Pickup.findById(req.params.id);

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: "Pickup not found",
      });
    }

    const User = require("../models/User");

    const collector = await User.findOne({
      _id: collectorId,
      role: "collector",
    });

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector not found",
      });
    }

    pickup.collector = collector._id;
    pickup.status = "Assigned";

    await pickup.save();

    const updatedPickup = await Pickup.findById(pickup._id)
      .populate("user", "name email phone address")
      .populate("collector", "name email phone");

    res.status(200).json({
      success: true,
      message: "Pickup assigned to collector successfully",
      pickup: updatedPickup,
    });
  } catch (error) {
    console.error("Assign Pickup Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// UPDATE PICKUP STATUS
// ===============================
const updatePickupStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "Pending",
      "Assigned",
      "On the Way",
      "Collected",
      "Completed",
      "Rejected",
      "Cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pickup status",
      });
    }

    const pickup = await Pickup.findByIdAndUpdate(
      req.params.id,
      { status },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("user", "name email phone")
      .populate("collector", "name phone");

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: "Pickup not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Pickup status updated successfully",
      pickup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// DELETE PICKUP
// ===============================
const deletePickup = async (req, res) => {
  try {
    const pickup = await Pickup.findByIdAndDelete(req.params.id);

    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: "Pickup not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Pickup deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
    createPickup,
  getMyPickups,
  getAllPickups,
  getPickupById,
  assignPickup,
  updatePickupStatus,
  deletePickup,  
};