const express = require("express");
const multer = require("multer");
const path = require("path");

const {
  createPickup,
  getMyPickups,
  getAllPickups,
  getPickupById,
  assignPickup,
  updatePickupStatus,
  deletePickup,
} = require("../controllers/pickupController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const router = express.Router();

// =====================================
// MULTER IMAGE UPLOAD CONFIGURATION
// =====================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

// Only image files allowed
const upload = multer({
  storage,

  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;

    const extension = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimeType = allowedTypes.test(file.mimetype);

    if (extension && mimeType) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, JPEG, PNG and WEBP images are allowed"
        )
      );
    }
  },

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// =====================================
// CREATE PICKUP
// POST /api/pickups
// =====================================

router.post(
  "/",
  protect,
  upload.single("image"),
  createPickup
);

// =====================================
// GET ALL PICKUPS - ADMIN
// GET /api/pickups
// =====================================

router.get(
  "/",
  protect,
  adminOnly,
  getAllPickups
);

// =====================================
// ASSIGN PICKUP TO COLLECTOR
// PUT /api/pickups/:id/assign
// =====================================

router.put(
  "/:id/assign",
  protect,
  adminOnly,
  assignPickup
);

// =====================================
// GET MY PICKUPS
// GET /api/pickups/my
// =====================================

router.get(
  "/my",
  protect,
  getMyPickups
);

// =====================================
// GET SINGLE PICKUP
// GET /api/pickups/:id
// =====================================

router.get(
  "/:id",
  protect,
  getPickupById
);

// =====================================
// UPDATE PICKUP STATUS
// PUT /api/pickups/:id/status
// =====================================

router.put(
  "/:id/status",
  protect,
  updatePickupStatus
);

// =====================================
// DELETE PICKUP
// DELETE /api/pickups/:id
// =====================================

router.delete(
  "/:id",
  protect,
  deletePickup
);

module.exports = router;
