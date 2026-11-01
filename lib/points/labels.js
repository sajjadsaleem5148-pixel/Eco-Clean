export const TYPE_LABELS = {
  EARN: "Earned",
  REDEEM: "Redeemed",
  REFUND: "Refunded",
  ADJUST: "Adjustment",
  REVERSAL: "Reversal",
};

export const MAX_POINTS_PER_ENTRY = 1000;

export function formatPoints(n) {
  return (n > 0 ? "+" : "") + n;
}
