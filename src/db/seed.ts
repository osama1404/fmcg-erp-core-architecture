import { db } from './mockDatabase';

export function runSeed() {
  db.seed();
  console.log('✅ FMCG Database successfully seeded:');
  console.log(`   - Tenants: ${db.tenants.length}`);
  console.log(`   - Warehouses: ${db.warehouses.length}`);
  console.log(`   - Products: ${db.products.length}`);
  console.log(`   - Batches (FEFO): ${db.batches.length}`);
  console.log(`   - Customers: ${db.customers.length}`);
  console.log(`   - Open Custody Sessions: ${db.custodySessions.length}`);
}

if (require.main === module) {
  runSeed();
}
