import { createServer, marketplaceRegistry, seedMarketplace } from "./index";

const port = Number(process.env.CAVAL_MARKETPLACE_PORT ?? 8787);

const bootstrap = async (): Promise<void> => {
  await seedMarketplace();
  const app = createServer();
  app.listen(port, () => {
    console.info(`[marketplace] listening on :${port}`);
  });
};

void bootstrap();
