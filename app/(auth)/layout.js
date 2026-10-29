import AuthShell from "@/components/layout/AuthShell";

export default function AuthLayout({ children }) {
  return <AuthShell label="Account">{children}</AuthShell>;
}
