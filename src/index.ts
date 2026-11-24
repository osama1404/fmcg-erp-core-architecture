import express from 'express';
import { router } from './api/routes';
import { runSeed } from './db/seed';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Mount API v1 router
app.use('/api/v1', router);

// Initialize seed data
runSeed();

export const server = app.listen(PORT, () => {
  console.log(`🚀 FMCG Core ERP Engine listening on port ${PORT}`);
  console.log(`📑 Health: http://localhost:${PORT}/api/v1/health`);
  console.log(`📦 Batches: http://localhost:${PORT}/api/v1/inventory/batches`);
});

export default app;
