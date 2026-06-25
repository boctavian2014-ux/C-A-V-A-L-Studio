import { getStripeClient } from "./client";

export interface CheckoutSessionInput {
  cavalId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}

export const createCheckoutSession = async (
  input: CheckoutSessionInput
): Promise<{ url: string; sessionId: string }> => {
  const priceId = process.env.STRIPE_PRICE_PRO;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_PRO is not configured");
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { caval_id: input.cavalId },
    subscription_data: {
      metadata: { caval_id: input.cavalId },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { url: session.url, sessionId: session.id };
};
