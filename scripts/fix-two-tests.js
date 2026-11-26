const fs = require("fs");
const path = require("path");

const backupDir = "scripts/backup-test-fix";
fs.mkdirSync(backupDir, { recursive: true });

function fix(file, steps) {
  if (!fs.existsSync(file)) {
    console.log("FAILED: " + file + " not found.");
    process.exit(1);
  }
  let src = fs.readFileSync(file, "utf8");
  const backup = path.join(backupDir, path.basename(file) + ".bak");
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
  console.log(file);
  steps.forEach(function (s) {
    const n = src.split(s.from).length - 1;
    if (n === 0) {
      console.log("   not found (already fixed?): " + s.label);
      return;
    }
    src = src.split(s.from).join(s.to);
    console.log("   FIXED (" + n + "): " + s.label);
  });
  fs.writeFileSync(file, src, "utf8");
}

fix("tests/unit/totp.test.js", [
  {
    from: 'toBe("123456789012");',
    to: 'toBe("1234567890");',
    label: "expected text is 10 characters (16 base32 characters = 10 bytes)",
  },
]);

fix("tests/integration/impact.test.js", [
  {
    from: '{ user: user._id, type: "EARN", points: 10 },',
    to: '{ transactionId: "T-1", user: user._id, type: "EARN", points: 10 },',
    label: "transaction 1 id",
  },
  {
    from: '{ user: user._id, type: "EARN", points: 15 },',
    to: '{ transactionId: "T-2", user: user._id, type: "EARN", points: 15 },',
    label: "transaction 2 id",
  },
  {
    from: '{ user: user._id, type: "REDEEM", points: -20 },',
    to: '{ transactionId: "T-3", user: user._id, type: "REDEEM", points: -20 },',
    label: "transaction 3 id",
  },
  {
    from: '{ user: user._id, type: "REFUND", points: 20 },',
    to: '{ transactionId: "T-4", user: user._id, type: "REFUND", points: 20 },',
    label: "transaction 4 id",
  },
]);

console.log("\nDone. Now run: npm test, then the one integration test.");