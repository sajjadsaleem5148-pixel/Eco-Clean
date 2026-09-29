const express = require("express");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// ===============================
// GET CURRENT USER
// ===============================

router.get("/me", protect, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});


// ===============================
// UPDATE PROFILE
// ===============================

router.put("/profile", protect, async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
    } = req.body;

    req.user.name = name || req.user.name;
    req.user.phone = phone || req.user.phone;
    req.user.address = address || req.user.address;

    const updatedUser = await req.user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;