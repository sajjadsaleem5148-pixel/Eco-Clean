"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import ComplaintTable from "@/components/admin/ComplaintTable";
import api from "@/lib/api";

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState([]);
  const [search, setSearch] = useState("");

  // Complaints load karna
  useEffect(() => {
    const loadComplaints = async () => {
      try {
        const token = localStorage.getItem("token");

        const response = await api.get("/admin/complaints", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setComplaints(response.data.complaints || []);
      } catch (error) {
        console.error(
          "Complaints load error:",
          error.response?.data?.message || error.message
        );
      }
    };

    loadComplaints();
  }, []);

  // Search filter
  const filteredComplaints = complaints.filter((complaint) => {
    const searchText = search.toLowerCase();

    return (
      complaint.subject?.toLowerCase().includes(searchText) ||
      complaint.description?.toLowerCase().includes(searchText) ||
      complaint.location?.toLowerCase().includes(searchText) ||
      complaint.user?.name?.toLowerCase().includes(searchText)
    );
  });

  return (
    <div>
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Complaints
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Manage citizen complaints and reports
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search complaints..."
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Complaint Table */}
      <ComplaintTable
        complaints={filteredComplaints}
      />
    </div>
  );
}