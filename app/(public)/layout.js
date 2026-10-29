import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <PublicNavbar />
      {children}
      <Footer />
    </div>
  );
}
