const fs = require("fs");
const file = "tests/integration/impact.test.js";
let src = fs.readFileSync(file, "utf8");
let n = 0;
[1, 2, 3, 4].forEach(function (i) {
  const from = '{ transactionId: "T-' + i + '", ';
  if (src.indexOf(from) >= 0 && src.indexOf('idempotencyKey: "K-' + i + '"') < 0) {
    src = src.replace(from, from + 'idempotencyKey: "K-' + i + '", ');
    n++;
  }
});
fs.writeFileSync(file, src, "utf8");
console.log("Updated " + n + " row(s).");