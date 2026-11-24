import { Router, Request, Response } from 'express';
import { FEFOAllocator } from '../modules/fefo/fefoAllocator';
import { DriverCustodyService } from '../modules/custody/driverCustodyService';
import { CreditLockService } from '../modules/credit/creditLockService';
import { UblXmlGenerator } from '../modules/einvoicing/ublXmlGenerator';
import { db } from '../db/mockDatabase';

export const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    system: 'fmcg-erp-core-architecture',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Inventory batches summary
router.get('/inventory/batches', (_req: Request, res: Response) => {
  res.json({
    success: true,
    totalBatches: db.batches.length,
    batches: db.batches,
  });
});

// Customer details & credit status
router.get('/customers/:id', (req: Request, res: Response) => {
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found.' });
  }
  return res.json({ success: true, customer });
});

// FEFO batch allocation endpoint
router.post('/orders/fefo-allocate', (req: Request, res: Response) => {
  try {
    const { tenantId, warehouseId, items } = req.body;
    if (!tenantId || !warehouseId || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, warehouseId, items[]',
      });
    }

    const allocationResults = FEFOAllocator.allocateOrder({ tenantId, warehouseId, items });
    return res.json({
      success: true,
      allocations: allocationResults,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Driver custody shift reconciliation endpoint
router.post('/drivers/reconcile-shift', (req: Request, res: Response) => {
  try {
    const { sessionId, cashDeposited, physicalStockCount, notes, reconciledBy } = req.body;
    if (!sessionId || cashDeposited === undefined || !reconciledBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, cashDeposited, reconciledBy',
      });
    }

    const session = DriverCustodyService.reconcileShift({
      sessionId,
      cashDeposited,
      physicalStockCount: physicalStockCount || [],
      notes,
      reconciledBy,
    });

    return res.json({
      success: true,
      reconciliationStatus: session.status,
      session,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Process bounced check & trigger credit lock
router.post('/credit/process-bounced-check', (req: Request, res: Response) => {
  try {
    const { tenantId, customerId, checkNumber, bankName, amount, dueDate, returnReasonCode, handledBy } =
      req.body;

    if (!tenantId || !customerId || !checkNumber || !amount || !returnReasonCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters for bounced check processing.',
      });
    }

    const outcome = CreditLockService.processBouncedCheck({
      tenantId,
      customerId,
      checkNumber,
      bankName: bankName || 'Standard Chartered UAE',
      amount,
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      returnReasonCode,
      handledBy: handledBy || 'SYSTEM_AUDITOR',
    });

    return res.json({
      success: true,
      ...outcome,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Generate ZATCA / UAE FTA Compliant UBL 2.1 E-Invoicing XML
router.post('/invoices/generate-xml', (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.invoiceNumber || !payload.tenant || !payload.customer || !Array.isArray(payload.lines)) {
      return res.status(400).json({
        success: false,
        error: 'Malformed invoice payload. Requires invoiceNumber, tenant, customer, lines[]',
      });
    }

    const result = UblXmlGenerator.generateInvoiceXml(payload);
    return res.json({
      success: true,
      invoiceNumber: payload.invoiceNumber,
      uuid: result.uuid,
      invoiceHashSha256: result.invoiceHashSha256,
      xmlContent: result.xmlContent,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
