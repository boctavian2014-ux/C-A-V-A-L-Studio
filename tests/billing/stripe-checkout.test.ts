import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSession = vi.fn();

vi.mock('../../billing/stripe/client', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: createSession } },
  }),
  isStripeConfigured: () => true,
}));

import { createCheckoutSession } from '../../billing/stripe/checkout';

describe('createCheckoutSession', () => {
  beforeEach(() => {
    createSession.mockReset();
    delete process.env.STRIPE_PRICE_PRO;
  });

  it('throws when STRIPE_PRICE_PRO is missing', async () => {
    await expect(
      createCheckoutSession({
        cavalId: 'user-1',
        email: 'a@b.com',
        successUrl: 'https://ok',
        cancelUrl: 'https://cancel',
      })
    ).rejects.toThrow(/STRIPE_PRICE_PRO is not configured/);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('throws when Stripe omits session.url', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    createSession.mockResolvedValue({ id: 'cs_1', url: null });

    await expect(
      createCheckoutSession({
        cavalId: 'user-1',
        email: 'a@b.com',
        successUrl: 'https://ok',
        cancelUrl: 'https://cancel',
      })
    ).rejects.toThrow(/did not return a checkout URL/);
  });

  it('returns checkout url and session id on success', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    createSession.mockResolvedValue({ id: 'cs_ok', url: 'https://checkout.stripe.com/cs_ok' });

    const result = await createCheckoutSession({
      cavalId: 'user-9',
      email: 'pro@caval.dev',
      successUrl: 'https://ok',
      cancelUrl: 'https://cancel',
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer_email: 'pro@caval.dev',
        line_items: [{ price: 'price_pro', quantity: 1 }],
        metadata: { caval_id: 'user-9' },
      })
    );
    expect(result).toEqual({
      url: 'https://checkout.stripe.com/cs_ok',
      sessionId: 'cs_ok',
    });
  });
});
