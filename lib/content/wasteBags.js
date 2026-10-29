// Abhi static examples hain. Baad mein yeh WasteCategory (MongoDB) se aayenge.
export const wasteBags = [
  {
    key: "green",
    name: "Green Bag",
    type: "Organic Waste",
    badge: "bg-emerald-700",
    examples: [
      "Fruit and vegetable scraps",
      "Suitable food waste",
      "Leaves and garden waste",
      "Locally approved biodegradable materials",
    ],
  },
  {
    key: "blue",
    name: "Blue Bag",
    type: "Recyclable Waste",
    badge: "bg-blue-700",
    examples: [
      "Paper and cardboard",
      "Suitable plastic packaging",
      "Metal cans",
      "Clean glass",
      "Other locally accepted recyclables",
    ],
  },
  {
    key: "red",
    name: "Red Bag",
    type: "Residual Waste",
    badge: "bg-red-700",
    examples: [
      "Non-recyclable household waste",
      "Residual materials permitted under local disposal requirements",
    ],
  },
];

export const bagNotice =
  "These are configurable examples, not universal disposal rules. Hazardous materials, batteries, medical waste, sharps, chemicals and electronic waste need separate approved disposal procedures.";
