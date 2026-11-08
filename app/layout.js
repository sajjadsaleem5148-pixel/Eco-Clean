import "./globals.css";

export const metadata = {
  title: "ECO-CLEAN | Clean Your Community. Grow a Greener Future.",
  description:
    "Report garbage, follow three-bag waste segregation, track collections and earn verified Green Points.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#064e3b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
