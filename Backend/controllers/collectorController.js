const Collector = require("../models/Collector");
const User = require("../models/User");
const Pickup = require("../models/Pickup");

// CREATE COLLECTOR
const createCollector = async (req, res) => {
  try {
    const {
      user,
      employeeId,
      phone,
      area,
      vehicleNumber,
      vehicleType,
    } = req.body;

    const existingUser = await User.findById(user);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    existingUser.role = "collector";
    await existingUser.save();

    const existingCollector = await Collector.findOne({
      $or: [{ employeeId }, { user }],
    });

    if (existingCollector) {
      return res.status(400).json({
        success: false,
        message: "Collector already exists",
      });
    }

    const collector = await Collector.create({
      user,
      employeeId,
      phone: phone || existingUser.phone || "",
      area: area || "",
      vehicleNumber: vehicleNumber || "",
      vehicleType: vehicleType || "",
    });

    res.status(201).json({
      success: true,
      message: "Collector created successfully",
      collector,
    });
  } catch (error) {
    console.error("Create Collector Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ALL COLLECTORS
const getCollectors = async (req, res) => {
  try {
    const collectors = await Collector.find()
      .populate("user", "name email phone address role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: collectors.length,
      collectors,
    });
  } catch (error) {
    console.error("Get Collectors Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET MY COLLECTOR
const getMyCollector = async (req, res) => {
  try {
    const collector = await Collector.findOne({
      user: req.user._id,
    }).populate(
      "user",
      "name email phone address role"
    );

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector profile not found",
      });
    }

    res.status(200).json({
      success: true,
      collector,
    });
  } catch (error) {
    console.error("Get My Collector Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET SINGLE COLLECTOR
const getCollectorById = async (req, res) => {
  try {
    const collector = await Collector.findById(
      req.params.id
    ).populate(
      "user",
      "name email phone address role"
    );

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector not found",
      });
    }

    res.status(200).json({
      success: true,
      collector,
    });
  } catch (error) {
    console.error("Get Collector Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// UPDATE COLLECTOR
const updateCollector = async (req, res) => {
  try {
    const collector = await Collector.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate(
      "user",
      "name email phone address role"
    );

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Collector updated successfully",
      collector,
    });
  } catch (error) {
    console.error("Update Collector Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE COLLECTOR
const deleteCollector = async (req, res) => {
  try {
    const collector = await Collector.findById(
      req.params.id
    );

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector not found",
      });
    }

    await User.findByIdAndUpdate(
      collector.user,
      {
        role: "citizen",
      }
    );

    await Collector.findByIdAndDelete(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message: "Collector deleted successfully",
    });
  } catch (error) {
    console.error("Delete Collector Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET COLLECTOR PICKUPS
const getCollectorPickups = async (req, res) => {
  try {
    const collector = await Collector.findById(
      req.params.id
    );

    if (!collector) {
      return res.status(404).json({
        success: false,
        message: "Collector not found",
      });
    }

    const pickups = await Pickup.find({
      collector: collector.user,
    })
      .populate(
        "user",
        "name phone address"
      )
      .sort({
        pickupDate: 1,
        pickupTime: 1,
      });

    res.status(200).json({
      success: true,
      count: pickups.length,
      pickups,
    });
  } catch (error) {
    console.error(
      "Get Collector Pickups Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// EXPORT
module.exports = {
  createCollector,
  getCollectors,
  getMyCollector,
  getCollectorById,
  updateCollector,
  deleteCollector,
  getCollectorPickups,
};