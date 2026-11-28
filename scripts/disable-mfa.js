const fs = require("fs");
const dns = require("dns");
const readline = require("readline");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

try {
  process.loadEnvFile(".env.local");
} catch (err) {
  console.error("FAILED: .env.local was not found.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("FAILED: MONGODB_URI is not set in .env.local.");
  process.exit(1);
}
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(function (resolve) {
    rl.question(question, function (answer) {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const email = (process.argv[2] || (await ask("Email of the account: "))).toLowerCase();
  if (!email) {
    console.log("No email given. Nothing changed.");
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const users = mongoose.connection.collection("users");
  const user = await users.findOne({ email: email, deletedAt: null }, { projection: { name: 1, role: 1, mfaEnabled: 1, mfaSecret: 1 } });

  if (!user) {
    console.log("No account found with that email. Nothing changed.");
    return;
  }

  console.log("Account: " + user.name + " (" + user.role + ")");
  if (!user.mfaEnabled && !user.mfaSecret) {
    console.log("Multi-factor sign-in is not on for this account. Nothing changed.");
    return;
  }

  const answer = await ask("Turn off multi-factor sign-in for this account? Type yes to continue: ");
  if (answer.toLowerCase() !== "yes") {
    console.log("Cancelled. Nothing changed.");
    return;
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: { mfaEnabled: false },
      $unset: { mfaSecret: "", mfaBackupCodes: "", mfaLastCounter: "" },
      $inc: { sessionVersion: 1 },
    }
  );
  await mongoose.connection.collection("auditlogs").insertOne({
    action: "mfa.disabled_by_script",
    targetType: "User",
    targetId: String(user._id),
    outcome: "SUCCESS",
    createdAt: new Date(),
  });
  console.log("Done. Multi-factor sign-in is off and old sessions were ended. The person must sign in again.");
}

main()
  .catch(function (err) {
    console.error("FAILED: " + err.message);
    process.exitCode = 1;
  })
  .finally(async function () {
    rl.close();
    try {
      await mongoose.disconnect();
    } catch (err) {
      // ignore
    }
  });