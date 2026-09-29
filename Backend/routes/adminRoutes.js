const express = require("express");

const {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getAllPickups,
  getAllComplaints,
  deleteComplaint,
} = require("../controllers/adminController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const router = express.Router();

// ==========================================
// ADMIN DASHBOARD
// ==========================================

router.get(
  "/dashboard",
  protect,
  adminOnly,
  getDashboardStats
);

// ==========================================
// USER MANAGEMENT
// ==========================================

// Get all users
router.get(
  "/users",
  protect,
  adminOnly,
  getAllUsers
);

// Get single user
router.get(
  "/users/:id",
  protect,
  adminOnly,
  getUserById
);

// Update user
router.put(
  "/users/:id",
  protect,
  adminOnly,
  updateUser
);

// Delete user
router.delete(
  "/users/:id",
  protect,
  adminOnly,
  deleteUser
);

// ==========================================
// PICKUP MANAGEMENT
// ==========================================

// Get all pickups
router.get(
  "/pickups",
  protect,
  adminOnly,
  getAllPickups
);

// ==========================================
// COMPLAINT MANAGEMENT
// ==========================================

// Get all complaints
router.get(
  "/complaints",
  protect,
  adminOnly,
  getAllComplaints
);

// Delete complaint
router.delete(
  "/complaints/:id",
  protect,
  adminOnly,
  deleteComplaint
);

module.exports = router;