"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
} from "lucide-react";

import api from "@/lib/api";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Notifications load karna
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
          "Notifications load error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, []);

  // Single notification read karna
  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await api.put(
        `/notifications/${id}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((previous) =>
        previous.map((notification) =>
          notification._id === id
            ? { ...notification, isRead: true }
            : notification
        )
      );
    } catch (error) {
      console.error(
        "Mark read error:",
        error.response?.data?.message || error.message
      );
    }
  };

  // Sab notifications read karna
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
        "Mark all read error:",
        error.response?.data?.message || error.message
      );
    }
  };

  // Notification delete karna
  const deleteNotification = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await api.delete(`/notifications/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setNotifications((previous) =>
        previous.filter(
          (notification) => notification._id !== id
        )
      );
    } catch (error) {
      console.error(
        "Notification delete error:",
        error.response?.data?.message || error.message
      );
    }
  };

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  return (
    <div>
      {/* Heading */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Notifications
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Stay updated about your EcoClean activities.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <CheckCheck size={18} />
            Mark All as Read
          </button>
        )}
      </div>

      {/* Unread Count */}
      {!loading && notifications.length > 0 && (
        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">
            You have{" "}
            <span className="font-bold">
              {unreadCount}
            </span>{" "}
            unread notification
            {unreadCount !== 1 ? "s" : ""}.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading notifications...
          </p>
        </div>
      ) : notifications.length > 0 ? (
        /* Notifications List */
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`rounded-xl border p-5 shadow-sm ${
                notification.isRead
                  ? "border-gray-200 bg-white"
                  : "border-green-200 bg-green-50/50"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                    notification.isRead
                      ? "bg-gray-100 text-gray-500"
                      : "bg-green-100 text-green-600"
                  }`}
                >
                  <Bell size={21} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <h2 className="font-semibold text-gray-800">
                        {notification.title}
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        {notification.message}
                      </p>
                    </div>

                    {!notification.isRead && (
                      <span className="h-fit w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        New
                      </span>
                    )}
                  </div>

                  {/* Bottom */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {notification.createdAt
                        ? new Date(
                            notification.createdAt
                          ).toLocaleString()
                        : "-"}
                    </span>

                    {!notification.isRead && (
                      <button
                        type="button"
                        onClick={() =>
                          markAsRead(notification._id)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Check size={14} />
                        Mark Read
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        deleteNotification(notification._id)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Bell size={28} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            No notifications
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            You don't have any notifications right now.
          </p>
        </div>
      )}
    </div>
  );
}