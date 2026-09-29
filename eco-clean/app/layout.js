import "./globals.css";

import Navbar from "../components/Navbar";

export const metadata = {
  title: "EcoClean - Smart Waste Management",
  description:
    "EcoClean is a smart waste management system for pickup requests, schedules, complaints and waste collection.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <Navbar />
      <body>{children}</body>
    </html>
  );
}

