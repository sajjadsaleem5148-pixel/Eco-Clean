const express = require("express");

const {
  createCollector,
  getCollectors,
  getMyCollector,
  getCollectorById,
  updateCollector,
  deleteCollector,
  getCollectorPickups,
} = require("../controllers/collectorController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const router = express.Router();

// =================================
// CURRENT LOGGED-IN COLLECTOR
// =================================

router.get(
  "/me",
  protect,
  getMyCollector
);

// =================================
// ADMIN ROUTES
// =================================

// Get all collectors
router.get(
  "/",
  protect,
  adminOnly,
  getCollectors
);

// Get single collector
router.get(
  "/:id",
  protect,
  adminOnly,
  getCollectorById
);

// Create collector
router.post(
  "/",
  protect,
  adminOnly,
  createCollector
);

// Update collector
router.put(
  "/:id",
  protect,
  adminOnly,
  updateCollector
);

// Delete collector
router.delete(
  "/:id",
  protect,
  adminOnly,
  deleteCollector
);

// =================================
// COLLECTOR PICKUPS
// =================================

router.get(
  "/:id/pickups",
  protect,
  getCollectorPickups
);

module.exports = router;