const express = require("express");

const {
  createSchedule,
  getSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
} = require("../controllers/scheduleController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const router = express.Router();

// Get all schedules
router.get("/", getSchedules);

// Get single schedule
router.get("/:id", getScheduleById);

// Admin creates schedule
router.post("/", protect, adminOnly, createSchedule);

// Admin updates schedule
router.put("/:id", protect, adminOnly, updateSchedule);

// Admin deletes schedule
router.delete("/:id", protect, adminOnly, deleteSchedule);

module.exports = router;