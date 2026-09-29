const User = require("../models/User");
const Pickup = require("../models/Pickup");
const Complaint = require("../models/Complaint");
const Schedule = require("../models/Schedule");
const Collector = require("../models/Collector");

// ==========================================
// GET DASHBOARD STATISTICS
// ==========================================

const getDashboardStats = async (req, res) => {
  try {
    // Total users
    const totalUsers = await User.countDocuments();

    // Total citizens
    const totalCitizens = await User.countDocuments({
      role: "citizen",
    });

    // Total collectors
    const totalCollectors = await User.countDocuments({
      role: "collector",
    });

    // Total admins
    const totalAdmins = await User.countDocuments({
      role: "admin",
    });

    // Total pickup requests
    const totalPickups = await Pickup.countDocuments();

    // Pending pickups
    const pendingPickups = await Pickup.countDocuments({
      status: "Pending",
    });

    // Completed pickups
    const completedPickups = await Pickup.countDocuments({
      status: "Completed",
    });

    // Cancelled pickups
    const cancelledPickups = await Pickup.countDocuments({
      status: "Cancelled",
    });

    // Total complaints
    const totalComplaints = await Complaint.countDocuments();

    // Pending complaints
    const pendingComplaints = await Complaint.countDocuments({
      status: "Pending",
    });

    // Resolved complaints
    const resolvedComplaints = await Complaint.countDocuments({
      status: "Resolved",
    });

    // Total schedules
    const totalSchedules = await Schedule.countDocuments();

    // Active schedules
    const activeSchedules = await Schedule.countDocuments({
      status: "Active",
    });

    res.status(200).json({
      success: true,

      stats: {
        users: totalUsers,
        citizens: totalCitizens,
        collectors: totalCollectors,
        admins: totalAdmins,

        pickups: totalPickups,
        pendingPickups,
        completedPickups,
        cancelledPickups,

        complaints: totalComplaints,
        pendingComplaints,
        resolvedComplaints,

        schedules: totalSchedules,
        activeSchedules,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET ALL USERS
// ==========================================

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET USER BY ID
// ==========================================

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// UPDATE USER
// ==========================================

const updateUser = async (req, res) => {
  try {
    const { name, phone, address, role } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update only provided fields
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (role !== undefined) user.role = role;

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// DELETE USER
// ==========================================

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Admin ko delete karne se prevent
    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Admin user cannot be deleted.",
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET ALL PICKUPS
// ==========================================

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
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET ALL COMPLAINTS
// ==========================================

const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// DELETE COMPLAINT
// ==========================================

const deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndDelete(
      req.params.id
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Complaint deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getAllPickups,
  getAllComplaints,
  deleteComplaint,
};