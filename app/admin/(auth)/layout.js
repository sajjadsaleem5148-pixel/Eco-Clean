import AuthShell from "@/components/layout/AuthShell";

export default function AdminAuthLayout({ children }) {
  return <AuthShell label="Staff sign-in">{children}</AuthShell>;
}
