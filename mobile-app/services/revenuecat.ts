export interface PaywallProduct {
  id: string;
  title: string;
  price: string;
  entitlement: string;
}

export const DEFAULT_PAYWALL_PRODUCTS: PaywallProduct[] = [
  { id: "caval_pro_monthly", title: "Caval Pro", price: "$19/mo", entitlement: "pro" },
  { id: "caval_team_monthly", title: "Caval Team", price: "$49/mo", entitlement: "team" }
];

export interface RevenueCatClient {
  configure(apiKey: string): Promise<void>;
  getOfferings(): Promise<PaywallProduct[]>;
  purchase(productId: string): Promise<{ ok: boolean; error?: string }>;
  restore(): Promise<{ ok: boolean }>;
}

export const createRevenueCatClient = (): RevenueCatClient => ({
  async configure(apiKey: string) {
    if (!apiKey) throw new Error("RevenueCat API key required.");
  },
  async getOfferings() {
    return DEFAULT_PAYWALL_PRODUCTS;
  },
  async purchase(productId: string) {
    return { ok: Boolean(productId) };
  },
  async restore() {
    return { ok: true };
  }
});
