// Helpers for testing server actions. The mocked session reads the user from globalThis.

export function signInAs(user) {
  globalThis.__ecoUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function signOut() {
  globalThis.__ecoUser = null;
}

export function form(fields) {
  const data = new FormData();
  Object.keys(fields).forEach((key) => {
    if (fields[key] !== undefined && fields[key] !== null) data.set(key, fields[key]);
  });
  return data;
}

// Runs an action. A redirect (which Next.js implements as a thrown error) is returned as { redirect }.
export async function run(fn) {
  try {
    return { result: await fn() };
  } catch (err) {
    if (err && err.message === "NEXT_REDIRECT") return { redirect: err.url };
    throw err;
  }
}
