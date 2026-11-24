export interface Tenant {
  id: string;
  code: string;
  legalName: string;
  taxRegistrationNumber: string;
  currency: string;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isBonded: boolean;
  isMobileVan: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  baseUom: string;
  shelfLifeDays: number;
  unitCostPrice: number;
  standardSellingPrice: number;
  taxRatePercent: number;
  isPerishable: boolean;
}

export interface ProductBatch {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  batchNumber: string;
  manufacturingDate: string; // ISO date YYYY-MM-DD
  expiryDate: string;        // ISO date YYYY-MM-DD
  quantityOnHand: number;
  quantityAllocated: number;
  isQuarantined: boolean;
}

export interface Customer {
  id: string;
  tenantId: string;
  code: string;
  legalName: string;
  tradeLicenseNumber: string;
  taxId: string;
  creditLimit: number;
  currentBalance: number;
  creditTermsDays: number;
  creditLocked: boolean;
  creditLockReason?: string;
  creditLockTimestamp?: string;
}

export interface DriverCustodySession {
  id: string;
  tenantId: string;
  driverId: string;
  vanWarehouseId: string;
  shiftStartTime: string;
  shiftEndTime?: string;
  status: 'OPEN' | 'PENDING_RECONCILIATION' | 'RECONCILED' | 'DISCREPANCY_FLAGGED';
  initialCashFloat: number;
  cashCollected: number;
  cashDeposited: number;
  cashVariance: number;
  stockVarianceCount: number;
  reconciledBy?: string;
  settlementNotes?: string;
}

export interface BouncedCheckEvent {
  id: string;
  tenantId: string;
  customerId: string;
  checkNumber: string;
  bankName: string;
  amount: number;
  dueDate: string;
  returnDate: string;
  returnReasonCode: 'INSUFFICIENT_FUNDS' | 'SIGNATURE_MISMATCH' | 'ACCOUNT_CLOSED' | 'STOP_PAYMENT';
  handledBy: string;
  isResolved: boolean;
}

export interface FEFOAllocationRequest {
  tenantId: string;
  warehouseId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
}

export interface BatchAllocationResult {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantityAllocated: number;
  daysUntilExpiry: number;
}

export interface FEFOAllocationResponse {
  productId: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  isFullyAllocated: boolean;
  allocations: BatchAllocationResult[];
}

export interface ShiftReconciliationPayload {
  sessionId: string;
  cashDeposited: number;
  physicalStockCount: {
    productId: string;
    actualQuantity: number;
    expectedQuantity: number;
  }[];
  notes?: string;
  reconciledBy: string;
}

export interface InvoiceXmlPayload {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  issueTime: string;
  tenant: {
    name: string;
    trn: string;
    address: string;
  };
  customer: {
    name: string;
    trn: string;
    address: string;
  };
  lines: {
    itemDescription: string;
    quantity: number;
    unitPrice: number;
    taxRatePercent: number;
    taxAmount: number;
    lineTotal: number;
  }[];
  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  totalTaxAmount: number;
}
