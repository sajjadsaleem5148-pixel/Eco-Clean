const readline = require("readline");
const dns = require("node:dns");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

process.loadEnvFile(".env.local");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(hidden ? answer : answer.trim());
    });
  });
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI set nahi hai");
  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection("users");

  const all = await users
    .find({ deletedAt: null }, { projection: { email: 1, role: 1, status: 1 } })
    .toArray();
  console.log("\nAccounts:");
  all.forEach((u) => console.log(" - " + u.email + " | " + u.role + " | " + u.status));

  const email = (await ask("\nJis account ka password reset karna hai, uski email: ")).toLowerCase();
  const user = await users.findOne({ email, deletedAt: null });
  if (!user) throw new Error("Is email se koi account nahi mila. Upar ki list se sahi email likhein.");

  const p1 = await ask("Naya password (12 se 72 characters): ", true);
  const p2 = await ask("Naya password dobara likhein: ", true);
  if (p1 !== p2) throw new Error("Dono passwords match nahi hue.");
  if (p1.length < 12 || p1.length > 72) throw new Error("Password 12 se 72 characters ka ho.");

  await users.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash: await bcrypt.hash(p1, 12), status: "ACTIVE", updatedAt: new Date() },
      $inc: { sessionVersion: 1 },
    }
  );
  console.log("\nPassword reset ho gaya: " + email);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nNakaam:", err.message);
  process.exit(1);
});