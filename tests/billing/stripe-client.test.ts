import { afterEach, describe, expect, it, vi } from 'vitest';

const { StripeCtor } = vi.hoisted(() => ({
  StripeCtor: vi.fn(function StripeMock(this: { secret: string }, key: string) {
    this.secret = key;
  }),
}));

vi.mock('stripe', () => ({
  default: StripeCtor,
}));

import { getStripeClient, isStripeConfigured } from '../../billing/stripe/client';

describe('stripe client', () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    StripeCtor.mockClear();
  });

  it('reports unconfigured when STRIPE_SECRET_KEY is missing', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
  });

  it('throws when creating a client without STRIPE_SECRET_KEY', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY is not configured/);
    expect(StripeCtor).not.toHaveBeenCalled();
  });

  it('constructs a Stripe client from STRIPE_SECRET_KEY', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    expect(isStripeConfigured()).toBe(true);
    const first = getStripeClient();
    const second = getStripeClient();
    expect(StripeCtor).toHaveBeenCalledWith('sk_test_123');
    expect(first).toBe(second);
    expect(first).toMatchObject({ secret: 'sk_test_123' });
  });
});
