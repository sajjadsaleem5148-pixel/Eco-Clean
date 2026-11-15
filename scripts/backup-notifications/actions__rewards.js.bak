"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { getCurrentUser } from "@/lib/auth/session";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { hit, makeKey } from "@/lib/security/rateLimit";
import {
  createProduct,
  adjustStock,
  redeemReward,
  transitionOrder,
  describeRewardError,
} from "@/services/rewards";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_FROM,
  STAFF_ORDER_STATUSES,
  REASON_REQUIRED_ORDER,
} from "@/lib/rewardStatus";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Please choose a valid option");
const orderRegex = /^ERD-\d{8}-[A-F0-9]{8}$/;

function refreshAll() {
  revalidatePath("/rewards");
  revalidatePath("/dashboard/rewards");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/green-points");
  revalidatePath("/admin/rewards");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/orders");
}

const productSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  category: z.enum(Object.keys(PRODUCT_CATEGORIES), { message: "Please choose a category" }),
  environmentalBenefit: z.string().trim().max(300).optional(),
  pointsPrice: z.coerce.number().int("Use a whole number").min(1, "Minimum price is 1 point").max(100000),
  initialStock: z.coerce.number().int("Use a whole number").min(0, "Stock cannot be negative").max(100000),
  lowStockThreshold: z.coerce.number().int("Use a whole number").min(0).max(100000),
  fulfillment: z.enum(["PICKUP", "DISPATCH"], { message: "Please choose a fulfillment method" }),
});

export async function createProductAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    environmentalBenefit: formData.get("environmentalBenefit") || undefined,
    pointsPrice: formData.get("pointsPrice"),
    initialStock: formData.get("initialStock"),
    lowStockThreshold: formData.get("lowStockThreshold"),
    fulfillment: formData.get("fulfillment"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await createProduct({ data: parsed.data, adminId: user.id });
    await writeAudit({
      actor: user.id,
      action: "reward.product.create",
      targetType: "RewardProduct",
      targetId: result.id,
      metadata: { name: parsed.data.name, pointsPrice: parsed.data.pointsPrice },
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Create product failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Product created as a draft. Publish it when it is ready." };
}

const statusSchema = z.object({
  productId: objectId,
  target: z.enum(PRODUCT_STATUSES, { message: "Invalid status" }),
});

export async function setProductStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    productId: formData.get("productId"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { productId, target } = parsed.data;

  try {
    await connectDB();
    const updated = await RewardProduct.findOneAndUpdate(
      { _id: productId, deletedAt: null, status: { $in: PRODUCT_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This product cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: "reward.product.status." + target.toLowerCase(),
      targetType: "RewardProduct",
      targetId: productId,
    });
  } catch (err) {
    console.error("Set product status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Product updated." };
}

const stockSchema = z.object({
  productId: objectId,
  delta: z.coerce
    .number()
    .int("Use a whole number")
    .refine((n) => n !== 0, { message: "Change cannot be zero" })
    .refine((n) => Math.abs(n) <= 100000, { message: "Change is too large" }),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
});

export async function adjustStockAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("inventory.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = stockSchema.safeParse({
    productId: formData.get("productId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await adjustStock({ productId: d.productId, delta: d.delta, reason: d.reason, adminId: user.id });
    await writeAudit({
      actor: user.id,
      action: "inventory.adjust",
      targetType: "RewardProduct",
      targetId: d.productId,
      reason: d.reason,
      metadata: { delta: d.delta },
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Adjust stock failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Stock updated." };
}

const redeemSchema = z.object({
  productId: objectId,
  note: z.string().trim().max(200, "Note is too long").optional(),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid form. Please reload the page."),
});

export async function redeemRewardAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "Please log in with a resident account to redeem rewards." };
  }

  const parsed = redeemSchema.safeParse({
    productId: formData.get("productId"),
    note: formData.get("note") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const rl = await hit(makeKey("redeem", user.id), 10, 60 * 60);
    if (!rl.ok) return { error: "Too many redemption attempts. Please try again later." };

    const result = await redeemReward({
      userId: user.id,
      productId: d.productId,
      idempotencyKey: d.idempotencyKey,
      note: d.note,
    });
    if (!result.duplicate) {
      await writeAudit({
        actor: user.id,
        action: "reward.redeem",
        targetType: "RewardOrder",
        targetId: result.orderNumber,
        metadata: { points: result.cost },
      });
    }
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Redeem failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  redirect("/dashboard/orders?placed=1");
}

const cancelSchema = z.object({
  orderNumber: z.string().regex(orderRegex, "Invalid order"),
  reason: z.string().trim().min(10, "Please explain why you are cancelling (at least 10 characters)").max(300),
});

export async function cancelOwnOrderAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") return { error: "You do not have permission to do this." };

  const parsed = cancelSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await transitionOrder({
      orderNumber: d.orderNumber,
      newStatus: "CANCELLED",
      actorId: user.id,
      reason: "Cancelled by resident: " + d.reason,
      ownerId: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "reward.order.cancelled",
      targetType: "RewardOrder",
      targetId: d.orderNumber,
      reason: d.reason,
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Cancel order failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Order cancelled. Your points were refunded." };
}

const orderStatusSchema = z.object({
  orderNumber: z.string().regex(orderRegex, "Invalid order"),
  status: z.enum(STAFF_ORDER_STATUSES, { message: "Please choose a status" }),
  reason: z.string().trim().max(300, "Text is too long (300 characters maximum)").optional(),
});

export async function updateOrderStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = orderStatusSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderNumber, status, reason } = parsed.data;

  if (REASON_REQUIRED_ORDER.includes(status) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required for this status." };
  }

  try {
    await transitionOrder({ orderNumber, newStatus: status, actorId: user.id, reason });
    await writeAudit({
      actor: user.id,
      action: "reward.order." + status.toLowerCase(),
      targetType: "RewardOrder",
      targetId: orderNumber,
      reason: REASON_REQUIRED_ORDER.includes(status) ? reason : undefined,
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Update order failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  revalidatePath("/admin/orders/" + orderNumber);
  return { success: "Order updated." };
}
