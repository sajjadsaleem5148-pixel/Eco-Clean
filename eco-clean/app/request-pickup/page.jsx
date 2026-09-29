"use client";

import { useState } from "react";
import api from "../../lib/api";

export default function RequestPickupPage() {
  const [formData, setFormData] = useState({
    wasteType: "",
    isSeparated: false,
    wasteDescription: "",
    address: "",
    phone: "",
    pickupDate: "",
    pickupTime: "",
    notes: "",
  });

  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Input change handle
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Image select
  const handleImageChange = (e) => {
    setImage(e.target.files[0]);
  };

  // Submit pickup request
  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage("");

    // Check waste type
    if (!formData.wasteType) {
      setMessage("Please select your waste type.");
      return;
    }

    // Waste separation check
    if (!formData.isSeparated) {
      setMessage(
        "Pickup cannot be requested. Please separate your waste properly."
      );
      return;
    }

    try {
      setLoading(true);

      const data = new FormData();

      data.append("wasteType", formData.wasteType);
      data.append("isSeparated", formData.isSeparated);
      data.append("wasteDescription", formData.wasteDescription);
      data.append("address", formData.address);
      data.append("phone", formData.phone);
      data.append("pickupDate", formData.pickupDate);
      data.append("pickupTime", formData.pickupTime);
      data.append("notes", formData.notes);

      if (image) {
        data.append("image", image);
      }

      const token = localStorage.getItem("token");

      const response = await api.post("/pickups", data, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setMessage(
        response.data.message || "Pickup request submitted successfully!"
      );

      // Reset form
      setFormData({
        wasteType: "",
        isSeparated: false,
        wasteDescription: "",
        address: "",
        phone: "",
        pickupDate: "",
        pickupTime: "",
        notes: "",
      });

      setImage(null);
    } catch (error) {
      console.error("Pickup Error:", error);

      setMessage(
        error.response?.data?.message ||
          "Failed to submit pickup request."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-lg md:p-8">

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-700">
            Request Waste Pickup
          </h1>

          <p className="mt-2 text-gray-600">
            Separate your waste and EcoClean will collect it from your location.
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-6 rounded-lg bg-green-100 p-4 text-center text-green-800">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Waste Type */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Select Waste Type
            </label>

            <select
              name="wasteType"
              value={formData.wasteType}
              onChange={handleChange}
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            >
              <option value="">Select Waste Type</option>
              <option value="Organic">
                🟢 Organic / Food Waste
              </option>
              <option value="Recyclable">
                🔵 Recyclable Waste
              </option>
              <option value="General">
                🟡 General / Other Waste
              </option>
            </select>
          </div>

          {/* Separation Confirmation */}
          <div className="rounded-lg border bg-green-50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="isSeparated"
                checked={formData.isSeparated}
                onChange={handleChange}
                className="mt-1 h-5 w-5"
              />

              <div>
                <p className="font-semibold text-gray-800">
                  My waste is properly separated
                </p>

                <p className="mt-1 text-sm text-gray-600">
                  Organic, recyclable and general waste are kept separately.
                </p>
              </div>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Waste Description
            </label>

            <textarea
              name="wasteDescription"
              value={formData.wasteDescription}
              onChange={handleChange}
              rows="3"
              placeholder="Example: Food waste, plastic bottles, cardboard..."
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Image */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Waste Image
            </label>

            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleImageChange}
              className="w-full rounded-lg border p-3"
            />

            <p className="mt-1 text-sm text-gray-500">
              JPG, PNG or WEBP — maximum 5 MB
            </p>
          </div>

          {/* Address */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Pickup Address
            </label>

            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows="2"
              placeholder="Enter your complete address"
              required
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Phone Number
            </label>

            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="03XX-XXXXXXX"
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Preferred Pickup Date
            </label>

            <input
              type="date"
              name="pickupDate"
              value={formData.pickupDate}
              onChange={handleChange}
              required
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Time */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Preferred Pickup Time
            </label>

            <input
              type="time"
              name="pickupTime"
              value={formData.pickupTime}
              onChange={handleChange}
              required
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-2 block font-semibold text-gray-700">
              Additional Notes
            </label>

            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Any additional information..."
              className="w-full rounded-lg border p-3 outline-none focus:border-green-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Submitting..." : "Request Pickup"}
          </button>

        </form>
      </div>
    </div>
  );
}