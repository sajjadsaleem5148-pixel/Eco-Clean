const express = require("express");

const {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  updateComplaint,
} = require("../controllers/complaintController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Create complaint
router.post("/", protect, createComplaint);

// Get my complaints
router.get("/my", protect, getMyComplaints);

// Get single complaint
router.get("/:id", protect, getComplaintById);

// Update complaint
router.put("/:id", protect, updateComplaint);

module.exports = router;