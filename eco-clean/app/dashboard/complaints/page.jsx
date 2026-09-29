"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  RefreshCw,
  MessageSquareWarning,
} from "lucide-react";

import api from "@/lib/api";
import Loading from "@/components/Loading";
import ComplaintCard from "@/components/ComplaintCard";

export default function MyComplaintsPage() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadComplaints = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await api.get("/complaints/my", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setComplaints(response.data.complaints || []);
    } catch (error) {
      console.error("Load complaints error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load your complaints."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  return (
    <div className="mx-auto max-w-6xl">

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            My Complaints
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            View the complaints you have submitted and their status.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadComplaints}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <Link
            href="/complaints"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            <Plus size={17} />
            New Complaint
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <Loading text="Loading your complaints..." />
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-700">
            Unable to load complaints
          </p>

          <p className="mt-1 text-sm text-red-600">
            {error}
          </p>

          <button
            type="button"
            onClick={loadComplaints}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && complaints.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <MessageSquareWarning size={30} />
          </div>

          <h2 className="mt-5 text-lg font-bold text-gray-900">
            No complaints yet
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
            If you notice a waste management problem, you can
            report it to the EcoClean administration team.
          </p>

          <Link
            href="/complaints"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            <Plus size={17} />
            Submit Complaint
          </Link>
        </div>
      )}

      {/* Complaints List */}
      {!loading && !error && complaints.length > 0 && (
        <div className="space-y-4">
          {complaints.map((complaint) => (
            <ComplaintCard
              key={complaint._id}
              complaint={complaint}
            />
          ))}
        </div>
      )}
    </div>
  );
}