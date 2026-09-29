const express = require("express");

const {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Get my notifications
router.get("/my", protect, getMyNotifications);

// Mark all as read
router.put("/read-all", protect, markAllAsRead);

// Mark single notification as read
router.put("/:id/read", protect, markAsRead);

// Delete notification
router.delete("/:id", protect, deleteNotification);

// Create notification
router.post("/", protect, createNotification);

module.exports = router;