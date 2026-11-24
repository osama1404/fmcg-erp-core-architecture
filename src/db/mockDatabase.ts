import { Tenant, Warehouse, Product, ProductBatch, Customer, DriverCustodySession, BouncedCheckEvent } from '../types';

export class MockDatabase {
  public tenants: Tenant[] = [];
  public warehouses: Warehouse[] = [];
  public products: Product[] = [];
  public batches: ProductBatch[] = [];
  public customers: Customer[] = [];
  public custodySessions: DriverCustodySession[] = [];
  public bouncedChecks: BouncedCheckEvent[] = [];

  constructor() {
    this.seed();
  }

  public seed() {
    const tenantId = 'ten-uae-fmcg-001';

    this.tenants = [
      {
        id: tenantId,
        code: 'GULF_FMCG_DIST',
        legalName: 'Gulf FMCG Distribution LLC',
        taxRegistrationNumber: 'TRN-100293847500003',
        currency: 'AED',
        isActive: true,
      },
    ];

    this.warehouses = [
      {
        id: 'wh-dubai-central',
        tenantId,
        code: 'DXB-ALQUOZ-01',
        name: 'Al Quoz Central Distribution Depot',
        isBonded: false,
        isMobileVan: false,
      },
      {
        id: 'van-sales-route-04',
        tenantId,
        code: 'VAN-DXB-MARINA-04',
        name: 'Mobile Van Route #4 (Marina & JBR)',
        isBonded: false,
        isMobileVan: true,
      },
    ];

    this.products = [
      {
        id: 'prod-milk-fullcream-2l',
        tenantId,
        sku: 'DAIRY-MILK-FC-2L',
        barcode: '6291002003014',
        name: 'Al Rawabi Fresh Milk Full Cream 2L',
        category: 'Dairy & Chilled',
        baseUom: 'BOTTLE',
        shelfLifeDays: 10,
        unitCostPrice: 8.50,
        standardSellingPrice: 11.00,
        taxRatePercent: 5.0,
        isPerishable: true,
      },
      {
        id: 'prod-laban-up-500ml',
        tenantId,
        sku: 'DAIRY-LABAN-500ML',
        barcode: '6291002003021',
        name: 'Fresh Laban Up 500ml Drink',
        category: 'Dairy & Chilled',
        baseUom: 'BOTTLE',
        shelfLifeDays: 14,
        unitCostPrice: 1.80,
        standardSellingPrice: 2.50,
        taxRatePercent: 5.0,
        isPerishable: true,
      },
      {
        id: 'prod-canned-tuna-160g',
        tenantId,
        sku: 'GROC-TUNA-SOLID-160G',
        barcode: '6291002003038',
        name: 'Ocean Gold White Meat Tuna in Olive Oil 160g',
        category: 'Ambient Canned Goods',
        baseUom: 'CAN',
        shelfLifeDays: 730,
        unitCostPrice: 4.20,
        standardSellingPrice: 6.50,
        taxRatePercent: 5.0,
        isPerishable: false,
      },
    ];

    // Seed multiple batches with varying expiration dates to verify FEFO sorting!
    // Note: Earliest expiring batches must be allocated first.
    this.batches = [
      {
        id: 'batch-milk-exp-soon',
        tenantId,
        productId: 'prod-milk-fullcream-2l',
        warehouseId: 'wh-dubai-central',
        batchNumber: 'LOT-MILK-20261120',
        manufacturingDate: '2026-11-20',
        expiryDate: '2026-11-30', // Expires in 6 days (Priority 1)
        quantityOnHand: 45,
        quantityAllocated: 0,
        isQuarantined: false,
      },
      {
        id: 'batch-milk-exp-mid',
        tenantId,
        productId: 'prod-milk-fullcream-2l',
        warehouseId: 'wh-dubai-central',
        batchNumber: 'LOT-MILK-20261123',
        manufacturingDate: '2026-11-23',
        expiryDate: '2026-12-03', // Expires in 9 days (Priority 2)
        quantityOnHand: 100,
        quantityAllocated: 0,
        isQuarantined: false,
      },
      {
        id: 'batch-milk-exp-fresh',
        tenantId,
        productId: 'prod-milk-fullcream-2l',
        warehouseId: 'wh-dubai-central',
        batchNumber: 'LOT-MILK-20261125',
        manufacturingDate: '2026-11-25',
        expiryDate: '2026-12-05', // Expires in 11 days (Priority 3)
        quantityOnHand: 200,
        quantityAllocated: 0,
        isQuarantined: false,
      },
      {
        id: 'batch-milk-quarantine',
        tenantId,
        productId: 'prod-milk-fullcream-2l',
        warehouseId: 'wh-dubai-central',
        batchNumber: 'LOT-MILK-DAMAGED',
        manufacturingDate: '2026-11-19',
        expiryDate: '2026-11-29',
        quantityOnHand: 15,
        quantityAllocated: 0,
        isQuarantined: true, // Must NOT be allocated!
      },
    ];

    this.customers = [
      {
        id: 'cust-spinneys-jumeirah',
        tenantId,
        code: 'RET-SPINNEYS-01',
        legalName: 'Spinneys Dubai LLC - Jumeirah Branch',
        tradeLicenseNumber: 'DXB-TL-59281',
        taxId: 'TRN-100482910300003',
        creditLimit: 500000.0,
        currentBalance: 12450.0,
        creditTermsDays: 45,
        creditLocked: false,
      },
      {
        id: 'cust-karama-minimarket',
        tenantId,
        code: 'RET-MINI-084',
        legalName: 'Al Karama Fresh Minimarket LLC',
        tradeLicenseNumber: 'DXB-TL-84729',
        taxId: 'TRN-100847291000003',
        creditLimit: 25000.0,
        currentBalance: 23800.0,
        creditTermsDays: 14,
        creditLocked: false,
      },
    ];

    this.custodySessions = [
      {
        id: 'session-shift-20261124-01',
        tenantId,
        driverId: 'drv-tariq-ahmed',
        vanWarehouseId: 'van-sales-route-04',
        shiftStartTime: '2026-11-24T06:00:00Z',
        status: 'OPEN',
        initialCashFloat: 500.0, // Initial cash float provided to driver
        cashCollected: 4250.0,   // Cash collected from cash sales
        cashDeposited: 0.0,
        cashVariance: 0.0,
        stockVarianceCount: 0,
      },
    ];
  }
}

export const db = new MockDatabase();
