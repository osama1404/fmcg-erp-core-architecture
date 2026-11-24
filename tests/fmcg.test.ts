import assert from 'assert';
import { FEFOAllocator } from '../src/modules/fefo/fefoAllocator';
import { DriverCustodyService } from '../src/modules/custody/driverCustodyService';
import { CreditLockService } from '../src/modules/credit/creditLockService';
import { UblXmlGenerator } from '../src/modules/einvoicing/ublXmlGenerator';
import { db } from '../src/db/mockDatabase';

console.log('🧪 Starting FMCG ERP Core Test Suite...\n');

// Reset mock DB
db.seed();

// Test 1: FEFO Allocation Algorithm
console.log('▶ Test 1: First-Expired, First-Out (FEFO) Allocation Verification');
const fefoResult = FEFOAllocator.allocateOrder({
  tenantId: 'ten-uae-fmcg-001',
  warehouseId: 'wh-dubai-central',
  items: [
    {
      productId: 'prod-milk-fullcream-2l',
      quantity: 50, // Available: 45 in priority 1 (expires soon), 100 in priority 2
    },
  ],
});

assert.strictEqual(fefoResult.length, 1);
assert.strictEqual(fefoResult[0].fulfilledQuantity, 50);
assert.strictEqual(fefoResult[0].isFullyAllocated, true);
assert.strictEqual(fefoResult[0].allocations.length, 2);

// Priority 1 batch must be fully consumed first (45 units)
assert.strictEqual(fefoResult[0].allocations[0].batchNumber, 'LOT-MILK-20261120');
assert.strictEqual(fefoResult[0].allocations[0].quantityAllocated, 45);

// Remaining 5 units must come from Priority 2 batch
assert.strictEqual(fefoResult[0].allocations[1].batchNumber, 'LOT-MILK-20261123');
assert.strictEqual(fefoResult[0].allocations[1].quantityAllocated, 5);
console.log('  ✔ Passed: Priority 1 batch depleted first, overflow routed to Priority 2.\n');

// Test 2: Driver Van-Sales Custody Reconciliation & Discrepancy Flagging
console.log('▶ Test 2: Driver Shift Custody Cash & Stock Reconciliation');
const reconciledSession = DriverCustodyService.reconcileShift({
  sessionId: 'session-shift-20261124-01',
  cashDeposited: 4700.0, // Expected: 500 float + 4250 collected = 4750 (50 AED shortage!)
  physicalStockCount: [
    {
      productId: 'prod-milk-fullcream-2l',
      actualQuantity: 10,
      expectedQuantity: 10,
    },
  ],
  notes: 'Minor shortage at shift closing.',
  reconciledBy: 'auditor-salem',
});

assert.strictEqual(reconciledSession.status, 'DISCREPANCY_FLAGGED');
assert.strictEqual(reconciledSession.cashVariance, -50.0);
console.log('  ✔ Passed: -50.00 AED cash variance detected, session flagged for auditor review.\n');

// Test 3: Bounced Check Auto-Lock & Order Denial
console.log('▶ Test 3: Bounced Check Automated Customer Credit Lockdown');
const customerId = 'cust-karama-minimarket';
const initialValidation = CreditLockService.validateCreditForOrder('ten-uae-fmcg-001', customerId, 500.0);
assert.strictEqual(initialValidation.isApproved, true);

// Trigger bounced check event
const bounceResult = CreditLockService.processBouncedCheck({
  tenantId: 'ten-uae-fmcg-001',
  customerId,
  checkNumber: 'CHK-ENBD-99182',
  bankName: 'Emirates NBD',
  amount: 8500.0,
  dueDate: '2026-11-20',
  returnReasonCode: 'INSUFFICIENT_FUNDS',
  handledBy: 'finance-analyst-hassan',
});

assert.strictEqual(bounceResult.customer.creditLocked, true);
assert.ok(bounceResult.customer.creditLockReason?.includes('CHK-ENBD-99182'));

// Attempt new order after bounce
const blockedValidation = CreditLockService.validateCreditForOrder('ten-uae-fmcg-001', customerId, 100.0);
assert.strictEqual(blockedValidation.isApproved, false);
console.log('  ✔ Passed: Customer credit locked instantly, subsequent order successfully blocked.\n');

// Test 4: UBL 2.1 E-Invoicing XML Generation & SHA-256 Digest
console.log('▶ Test 4: ZATCA / UAE FTA Compliant UBL 2.1 E-Invoice Generation');
const xmlResult = UblXmlGenerator.generateInvoiceXml({
  invoiceId: 'inv-dxb-2026-0091',
  invoiceNumber: 'INV-2026-0091',
  issueDate: '2026-11-24',
  issueTime: '12:00:00',
  tenant: {
    name: 'Gulf FMCG Distribution LLC',
    trn: '100293847500003',
    address: 'Al Quoz Industrial Area 3, Dubai, UAE',
  },
  customer: {
    name: 'Spinneys Dubai LLC',
    trn: '100482910300003',
    address: 'Jumeirah Beach Road, Dubai, UAE',
  },
  lines: [
    {
      itemDescription: 'Al Rawabi Fresh Milk Full Cream 2L',
      quantity: 100,
      unitPrice: 11.0,
      taxRatePercent: 5.0,
      taxAmount: 55.0,
      lineTotal: 1100.0,
    },
  ],
  taxExclusiveAmount: 1100.0,
  taxInclusiveAmount: 1155.0,
  totalTaxAmount: 55.0,
});

assert.ok(xmlResult.xmlContent.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'));
assert.ok(xmlResult.xmlContent.includes('<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:uae:fta:einvoice:v1.0</cbc:CustomizationID>'));
assert.ok(xmlResult.xmlContent.includes('100293847500003'));
assert.ok(xmlResult.invoiceHashSha256.length > 20);
console.log(`  ✔ Passed: UBL 2.1 XML generated, SHA-256 digest calculated (${xmlResult.invoiceHashSha256.substring(0, 16)}...)\n`);

console.log('🎉 ALL FMCG ERP CORE ARCHITECTURE TESTS PASSED SUCCESSFULLY!');
