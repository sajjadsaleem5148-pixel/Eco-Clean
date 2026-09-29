const Complaint = require("../models/Complaint");


// ===============================
// CREATE COMPLAINT
// ===============================

const createComplaint = async (req, res) => {
  try {
    const {
      subject,
      description,
      location,
    } = req.body;

    const complaint = await Complaint.create({
      user: req.user._id,
      subject,
      description,
      location,
      image: req.file ? req.file.filename : "",
    });

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      complaint,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ===============================
// GET MY COMPLAINTS
// ===============================

const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

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


// ===============================
// GET SINGLE COMPLAINT
// ===============================

const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(
      req.params.id
    ).populate("user", "name email phone");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      complaint,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ===============================
// UPDATE COMPLAINT
// ===============================

const updateComplaint = async (req, res) => {
  try {
    const {
      status,
      adminReply,
    } = req.body;

    const complaint =
      await Complaint.findByIdAndUpdate(
        req.params.id,
        {
          status,
          adminReply,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Complaint updated successfully",
      complaint,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  updateComplaint,
};