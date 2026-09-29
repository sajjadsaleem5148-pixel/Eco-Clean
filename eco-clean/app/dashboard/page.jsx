"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    // Login nahi hai
    if (!token || !savedUser) {
      router.push("/login");
      return;
    }

    setUser(JSON.parse(savedUser));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    router.push("/login");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-5xl mx-auto">

        <div className="bg-white rounded-2xl shadow p-8">

          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500">
                Welcome to EcoClean
              </p>

              <h1 className="text-3xl font-bold text-green-700">
                {user.name}
              </h1>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg"
            >
              Logout
            </button>
          </div>

          <div className="mt-8 grid md:grid-cols-3 gap-5">

            <div className="bg-green-50 p-6 rounded-xl">
              <h2 className="font-bold text-green-700">
                Pickup Requests
              </h2>
              <p className="text-gray-500 mt-2">
                0 Requests
              </p>
            </div>

            <div className="bg-blue-50 p-6 rounded-xl">
              <h2 className="font-bold text-blue-700">
                Complaints
              </h2>
              <p className="text-gray-500 mt-2">
                0 Complaints
              </p>
            </div>

            <div className="bg-yellow-50 p-6 rounded-xl">
              <h2 className="font-bold text-yellow-700">
                Notifications
              </h2>
              <p className="text-gray-500 mt-2">
                0 Notifications
              </p>
            </div>

          </div>

        </div>

      </div>

    </main>
  );
}