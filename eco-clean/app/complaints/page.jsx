"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Upload,
  MapPin,
  Send,
} from "lucide-react";

export default function ComplaintsPage() {
  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    location: "",
  });

  const [image, setImage] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      setImage(file);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    console.log("Complaint Data:", formData);
    console.log("Complaint Image:", image);

    alert("Complaint submitted successfully!");

    setFormData({
      subject: "",
      description: "",
      location: "",
    });

    setImage(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-green-700 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <AlertTriangle size={26} />
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                Report a Problem
              </h1>

              <p className="mt-1 text-sm text-green-100">
                Submit a complaint about waste collection or cleanliness.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8"
        >
          {/* Introduction */}
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              Complaint Details
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Provide accurate information so our team can resolve
              the issue quickly.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {/* Subject */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Complaint Subject
              </label>

              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                placeholder="e.g. Garbage not collected"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Description
              </label>

              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows="5"
                placeholder="Describe the problem in detail..."
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Location */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <MapPin size={16} className="text-green-600" />
                Problem Location
              </label>

              <textarea
                name="location"
                value={formData.location}
                onChange={handleChange}
                rows="3"
                placeholder="Enter the location where the problem occurred..."
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Image */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Evidence Image
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center hover:border-green-500 hover:bg-green-50">
                <Upload size={28} className="text-gray-400" />

                <p className="mt-3 text-sm font-medium text-gray-700">
                  {image ? image.name : "Upload an image"}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  JPG, PNG or WEBP — maximum 5MB
                </p>

                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="mt-8 flex justify-end border-t border-gray-100 pt-6">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
            >
              <Send size={18} />
              Submit Complaint
            </button>
          </div>
        </form>

        {/* Information Box */}
        <div className="mt-6 rounded-xl border border-green-100 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              className="mt-0.5 text-green-600"
            />

            <div>
              <h3 className="text-sm font-semibold text-green-800">
                Complaint Processing
              </h3>

              <p className="mt-1 text-sm text-green-700">
                After submission, your complaint will be reviewed
                by the EcoClean administration team. You can track
                its status from your dashboard.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}