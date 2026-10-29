const dns = require("node:dns");
const mongoose = require("mongoose");

process.loadEnvFile(".env.local");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const hazardous = [
  "Hazardous materials",
  "Batteries",
  "Medical waste and sharps",
  "Chemicals",
  "Electronic waste",
];

const categories = [
  {
    key: "green",
    name: "Green Bag - Organic Waste",
    color: "#047857",
    description: "Organic waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Fruit and vegetable scraps",
      "Suitable food waste",
      "Leaves and garden waste",
      "Locally approved biodegradable materials",
    ],
    sortOrder: 1,
  },
  {
    key: "blue",
    name: "Blue Bag - Recyclable Waste",
    color: "#1d4ed8",
    description: "Recyclable waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Paper and cardboard",
      "Suitable plastic packaging",
      "Metal cans",
      "Clean glass",
      "Other locally accepted recyclables",
    ],
    sortOrder: 2,
  },
  {
    key: "red",
    name: "Red Bag - Residual Waste",
    color: "#b91c1c",
    description: "Residual waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Non-recyclable household waste",
      "Residual materials permitted under local disposal requirements",
    ],
    sortOrder: 3,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed script production mein nahi chal sakti.");
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI set nahi hai");

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const now = new Date();

  for (const c of categories) {
    const res = await db.collection("wastecategories").updateOne(
      { key: c.key },
      {
        $setOnInsert: {
          ...c,
          prohibitedMaterials: hazardous,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    console.log(c.key + ": " + (res.upsertedCount ? "banayi" : "pehle se maujood"));
  }

  const zoneRes = await db.collection("servicezones").updateOne(
    { slug: "demo-zone-a" },
    {
      $setOnInsert: {
        name: "Demo Zone A",
        slug: "demo-zone-a",
        description: "Development demo data. Rename or delete before real use.",
        status: "ACTIVE",
        targetCollectionEveryDays: 3,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
  console.log("demo-zone-a: " + (zoneRes.upsertedCount ? "banayi" : "pehle se maujood"));

  await mongoose.disconnect();
  console.log("Seed mukammal.");
}

main().catch((err) => {
  console.error("Nakaam:", err.message);
  process.exit(1);
});
