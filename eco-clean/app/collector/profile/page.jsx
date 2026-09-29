"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UserCircle,
  Mail,
  Phone,
  MapPin,
  Truck,
  BadgeCheck,
  ArrowLeft,
} from "lucide-react";

import api from "@/lib/api";

export default function CollectorProfilePage() {
  const [collector, setCollector] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");

        if (!token || !userData) {
          setLoading(false);
          return;
        }

        const user = JSON.parse(userData);

        const response = await api.get("/collectors", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const collectors = response.data.collectors || [];

        const currentCollector = collectors.find(
          (item) => item.user?._id === user._id
        );

        setCollector(currentCollector || null);
      } catch (error) {
        console.error(
          "Collector profile error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading collector profile...
          </p>
        </div>
      </div>
    );
  }

  if (!collector) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <UserCircle
            size={55}
            className="mx-auto text-gray-300"
          />

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            Collector Profile Not Found
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Your collector information could not be loaded.
          </p>

          <Link
            href="/collector"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <ArrowLeft size={17} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/collector"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
          >
            <ArrowLeft size={17} />
            Back to Dashboard
          </Link>

          <h1 className="mt-4 text-3xl font-bold text-gray-800">
            Collector Profile
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            View your EcoClean collector information.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Profile Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-50 text-green-600">
              <UserCircle size={64} />
            </div>

            <h2 className="mt-5 text-xl font-bold text-gray-800">
              {collector.user?.name || "Collector"}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Waste Collection Staff
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
              <BadgeCheck size={15} />
              {collector.status || "Available"}
            </div>
          </div>

          {/* Information */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Personal & Work Information
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Your registered collector details.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Name */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <UserCircle
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Full Name
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.user?.name || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Mail
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Email
                      </p>

                      <p className="mt-1 break-all text-sm font-medium text-gray-700">
                        {collector.user?.email || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Phone */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Phone
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Phone
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.phone ||
                          collector.user?.phone ||
                          "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Employee ID */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <BadgeCheck
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Employee ID
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.employeeId || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Area */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <MapPin
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Assigned Area
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.area || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vehicle */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Truck
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Vehicle
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.vehicleNumber || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vehicle Type */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Truck
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Vehicle Type
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.vehicleType || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Joining Date */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <BadgeCheck
                      size={19}
                      className="text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Joining Date
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {collector.joiningDate
                          ? new Date(
                              collector.joiningDate
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}