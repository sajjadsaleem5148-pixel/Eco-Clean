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
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI set nahi hai");

  const name = await ask("Naam: ");
  const email = (await ask("Email: ")).toLowerCase();
  const password = await ask("Password (kam az kam 12 characters): ", true);

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Naam ya email sahi nahi");
  if (password.length < 12 || password.length > 72) throw new Error("Password 12 se 72 characters ka ho");

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection("users");

  if (await users.findOne({ isRootAdmin: true })) {
    throw new Error("Root Super Admin pehle se maujood hai.");
  }
  if (await users.findOne({ email })) {
    throw new Error("Is email se account pehle se hai. Doosri email use karein.");
  }

  const now = new Date();
  await users.insertOne({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    emailVerified: false,
    sessionVersion: 0,
    isRootAdmin: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  console.log("\nSuper Admin ban gaya:", email);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nNakaam:", err.message);
  process.exit(1);
});