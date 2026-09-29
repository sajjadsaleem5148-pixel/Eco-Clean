"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  Trash2,
  CheckCheck,
} from "lucide-react";

import api from "@/lib/api";

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          setLoading(false);
          return;
        }

        const response = await api.get("/notifications/my", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setNotifications(
          response.data.notifications || []
        );
      } catch (error) {
        console.error(
          "Admin notifications error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");

      await api.put(
        `/notifications/${notificationId}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((previous) =>
        previous.map((notification) =>
          notification._id === notificationId
            ? { ...notification, isRead: true }
            : notification
        )
      );
    } catch (error) {
      console.error(
        "Mark notification error:",
        error.response?.data?.message || error.message
      );
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem("token");

      await api.put(
        "/notifications/read-all",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((previous) =>
        previous.map((notification) => ({
          ...notification,
          isRead: true,
        }))
      );
    } catch (error) {
      console.error(
        "Mark all notifications error:",
        error.response?.data?.message || error.message
      );
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      const token = localStorage.getItem("token");

      await api.delete(
        `/notifications/${notificationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((previous) =>
        previous.filter(
          (notification) =>
            notification._id !== notificationId
        )
      );
    } catch (error) {
      console.error(
        "Delete notification error:",
        error.response?.data?.message || error.message
      );
    }
  };

  const getIcon = (type) => {
    if (type === "pickup") return "🚛";
    if (type === "complaint") return "⚠️";
    if (type === "schedule") return "📅";

    return "🔔";
  };

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
        >
          <ArrowLeft size={17} />
          Back to Dashboard
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-800">
                Notifications
              </h1>

              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Manage your EcoClean system notifications.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <CheckCheck size={17} />
              Mark All as Read
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading notifications...
          </p>
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`rounded-xl border p-5 shadow-sm ${
                notification.isRead
                  ? "border-gray-200 bg-white"
                  : "border-green-200 bg-green-50/40"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl ${
                    notification.isRead
                      ? "bg-gray-100"
                      : "bg-green-100"
                  }`}
                >
                  {getIcon(notification.type)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-gray-800">
                          {notification.title}
                        </h2>

                        {!notification.isRead && (
                          <span className="h-2 w-2 rounded-full bg-green-600"></span>
                        )}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {notification.message}
                      </p>
                    </div>

                    <p className="shrink-0 text-xs text-gray-400">
                      {notification.createdAt
                        ? new Date(
                            notification.createdAt
                          ).toLocaleString()
                        : "-"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!notification.isRead && (
                      <button
                        type="button"
                        onClick={() =>
                          markAsRead(
                            notification._id
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        <Check size={15} />
                        Mark as Read
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        deleteNotification(
                          notification._id
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Bell size={28} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            No Notifications
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            There are currently no notifications for this
            admin account.
          </p>

          <Link
            href="/admin"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <ArrowLeft size={17} />
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}