import { useEffect, useState } from "react";
import { createRevenueCatClient, type PaywallProduct } from "../services/revenuecat";

const revenueCat = createRevenueCatClient();

export const PaywallScreen = () => {
  const [products, setProducts] = useState<PaywallProduct[]>([]);
  const [status, setStatus] = useState("Loading offerings...");

  useEffect(() => {
    void revenueCat.configure(process.env.REVENUECAT_API_KEY ?? "").then(async () => {
      setProducts(await revenueCat.getOfferings());
      setStatus("Ready");
    }).catch((error: Error) => setStatus(error.message));
  }, []);

  return (
    <section>
      <h1>Upgrade to Caval Pro</h1>
      <p>{status}</p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <strong>{product.title}</strong> — {product.price}
            <button type="button" onClick={() => void revenueCat.purchase(product.id)}>Subscribe</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void revenueCat.restore()}>Restore purchases</button>
    </section>
  );
};
