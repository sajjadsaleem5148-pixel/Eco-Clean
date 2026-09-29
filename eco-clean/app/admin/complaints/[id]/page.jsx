"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquareWarning,
  User,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Send,
  CheckCircle2,
} from "lucide-react";

import api from "@/lib/api";

export default function AdminComplaintDetailsPage({ params }) {
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [status, setStatus] = useState("Pending");
  const [adminReply, setAdminReply] = useState("");

  useEffect(() => {
    const loadComplaint = async () => {
      try {
        const token = localStorage.getItem("token");
        const { id } = await params;

        const response = await api.get(`/complaints/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = response.data.complaint;

        setComplaint(data || null);

        if (data) {
          setStatus(data.status || "Pending");
          setAdminReply(data.adminReply || "");
        }
      } catch (error) {
        console.error(
          "Complaint details error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadComplaint();
  }, [params]);

  const updateComplaint = async () => {
    try {
      setUpdating(true);

      const token = localStorage.getItem("token");

      const response = await api.put(
        `/complaints/${complaint._id}`,
        {
          status,
          adminReply,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setComplaint(response.data.complaint);

      alert("Complaint updated successfully.");
    } catch (error) {
      console.error(
        "Complaint update error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to update complaint."
      );
    } finally {
      setUpdating(false);
    }
  };

  const getStatusClass = (currentStatus) => {
    if (currentStatus === "Resolved") {
      return "bg-green-100 text-green-700";
    }

    if (currentStatus === "Rejected") {
      return "bg-red-100 text-red-700";
    }

    if (currentStatus === "In Progress") {
      return "bg-blue-100 text-blue-700";
    }

    return "bg-yellow-100 text-yellow-700";
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading complaint details...
          </p>
        </div>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center shadow-sm">
          <MessageSquareWarning
            size={48}
            className="mx-auto text-gray-400"
          />

          <h2 className="mt-4 text-xl font-semibold text-gray-800">
            Complaint Not Found
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            The requested complaint could not be found.
          </p>

          <Link
            href="/admin/complaints"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <ArrowLeft size={17} />
            Back to Complaints
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <Link
          href="/admin/complaints"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
        >
          <ArrowLeft size={17} />
          Back to Complaints
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Complaint Details
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Review and manage citizen complaint.
            </p>
          </div>

          <span
            className={`w-fit rounded-full px-4 py-2 text-sm font-medium ${getStatusClass(
              complaint.status
            )}`}
          >
            {complaint.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 xl:col-span-2">
          {/* Complaint Information */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
                <MessageSquareWarning size={21} />
              </div>

              <div>
                <h2 className="font-semibold text-gray-800">
                  Complaint Information
                </h2>

                <p className="text-xs text-gray-500">
                  ID: {complaint._id}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs text-gray-400">
                Subject
              </p>

              <h2 className="mt-1 text-xl font-semibold text-gray-800">
                {complaint.subject}
              </h2>
            </div>

            <div className="mt-6">
              <p className="text-xs text-gray-400">
                Description
              </p>

              <div className="mt-2 rounded-lg bg-gray-50 p-4">
                <p className="text-sm leading-7 text-gray-600">
                  {complaint.description}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <MapPin
                  size={18}
                  className="mt-0.5 text-gray-400"
                />

                <div>
                  <p className="text-xs text-gray-400">
                    Location
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {complaint.location || "Not provided"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CalendarDays
                  size={18}
                  className="mt-0.5 text-gray-400"
                />

                <div>
                  <p className="text-xs text-gray-400">
                    Submitted
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {complaint.createdAt
                      ? new Date(
                          complaint.createdAt
                        ).toLocaleString()
                      : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Complaint Image */}
            {complaint.image && (
              <div className="mt-6 border-t border-gray-100 pt-5">
                <p className="mb-3 text-sm font-semibold text-gray-700">
                  Complaint Image
                </p>

                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL?.replace(
                    "/api",
                    ""
                  )}/uploads/${complaint.image}`}
                  alt="Complaint"
                  className="max-h-96 rounded-lg border border-gray-200 object-contain"
                />
              </div>
            )}
          </div>

          {/* Citizen Information */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <User size={21} />
              </div>

              <div>
                <h2 className="font-semibold text-gray-800">
                  Citizen Information
                </h2>

                <p className="text-xs text-gray-500">
                  Complaint submitted by
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <p className="text-xs text-gray-400">
                  Name
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-700">
                  {complaint.user?.name || "Unknown"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Email
                </p>

                <p className="mt-1 flex items-center gap-2 break-all text-sm font-medium text-gray-700">
                  <Mail size={16} />
                  {complaint.user?.email || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Phone
                </p>

                <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Phone size={16} />
                  {complaint.user?.phone || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Actions */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <CheckCircle2
                size={21}
                className="text-green-600"
              />

              <div>
                <h2 className="font-semibold text-gray-800">
                  Manage Complaint
                </h2>

                <p className="text-xs text-gray-500">
                  Update status and reply
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Complaint Status
              </label>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value)
                }
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              >
                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Resolved">
                  Resolved
                </option>

                <option value="Rejected">
                  Rejected
                </option>
              </select>
            </div>

            {/* Reply */}
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Admin Reply
              </label>

              <textarea
                value={adminReply}
                onChange={(event) =>
                  setAdminReply(event.target.value)
                }
                rows="7"
                placeholder="Write a reply to the citizen..."
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Save */}
            <button
              type="button"
              onClick={updateComplaint}
              disabled={updating}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={17} />

              {updating
                ? "Updating..."
                : "Update Complaint"}
            </button>
          </div>

          {/* Existing Reply */}
          {complaint.adminReply && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-6">
              <h2 className="font-semibold text-green-800">
                Current Admin Reply
              </h2>

              <p className="mt-3 text-sm leading-6 text-green-700">
                {complaint.adminReply}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}