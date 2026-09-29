"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Send,
  Clock,
} from "lucide-react";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    console.log("Contact Form:", formData);

    alert("Your message has been sent successfully!");

    setFormData({
      name: "",
      email: "",
      subject: "",
      message: "",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-green-700 px-6 py-16 text-white">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl font-bold">
            Contact EcoClean
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-green-100">
            Have a question, suggestion or issue? Get in touch
            with the EcoClean team.
          </p>
        </div>
      </section>

      {/* Contact Content */}
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Contact Information */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <Mail size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-gray-800">
                Email
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                support@ecoclean.com
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <Phone size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-gray-800">
                Phone
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                +92 300 1234567
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <MapPin size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-gray-800">
                Location
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Karachi, Pakistan
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <Clock size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-gray-800">
                Working Hours
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Monday - Saturday
              </p>

              <p className="text-sm text-gray-500">
                9:00 AM - 6:00 PM
              </p>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8"
            >
              <h2 className="text-2xl font-bold text-gray-800">
                Send Us a Message
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Fill out the form and our team will get back to you.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Your Name
                  </label>

                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Enter your name"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email Address
                  </label>

                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="Enter your email"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Subject */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Subject
                  </label>

                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    placeholder="What is your message about?"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Message */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Message
                  </label>

                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows="7"
                    placeholder="Write your message here..."
                    className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
                >
                  <Send size={18} />
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}