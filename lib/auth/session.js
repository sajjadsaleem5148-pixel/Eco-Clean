import { auth } from "@/auth";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";

// Role aur status hamesha database se aate hain, cookie par bharosa nahi.
export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  await connectDB();
  const user = await User.findById(id).lean();
  if (!user || user.deletedAt || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== session.user.sessionVersion) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
