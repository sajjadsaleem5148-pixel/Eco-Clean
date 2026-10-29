import { logoutAction } from "@/actions/auth";

export default function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit"
        className="min-h-11 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">
        Logout
      </button>
    </form>
  );
}
