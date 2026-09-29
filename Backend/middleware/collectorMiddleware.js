const collectorOnly = (req, res, next) => {
  // Check authentication
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  // Check collector role
  if (req.user.role !== "collector") {
    return res.status(403).json({
      success: false,
      message: "Collector access required.",
    });
  }

  // Allow collector
  next();
};

module.exports = collectorOnly;