import { db } from '../../db/mockDatabase';
import { ShiftReconciliationPayload, DriverCustodySession } from '../../types';

export class DriverCustodyService {
  /**
   * Reconciles end-of-shift driver custody for cash and inventory.
   * Identifies any leakage before closing the shift ledger.
   */
  public static reconcileShift(payload: ShiftReconciliationPayload): DriverCustodySession {
    const session = db.custodySessions.find((s) => s.id === payload.sessionId);
    if (!session) {
      throw new Error(`Custody session '${payload.sessionId}' not found.`);
    }

    if (session.status === 'RECONCILED') {
      throw new Error(`Session '${payload.sessionId}' is already reconciled and sealed.`);
    }

    const expectedCashTotal = session.initialCashFloat + session.cashCollected;
    const cashVariance = Number((payload.cashDeposited - expectedCashTotal).toFixed(2));

    // Audit physical stock count against van inventory
    let stockVarianceCount = 0;
    for (const item of payload.physicalStockCount) {
      if (item.actualQuantity !== item.expectedQuantity) {
        stockVarianceCount += Math.abs(item.actualQuantity - item.expectedQuantity);
      }
    }

    session.cashDeposited = payload.cashDeposited;
    session.cashVariance = cashVariance;
    session.stockVarianceCount = stockVarianceCount;
    session.shiftEndTime = new Date().toISOString();
    session.reconciledBy = payload.reconciledBy;
    session.settlementNotes = payload.notes || '';

    if (cashVariance !== 0 || stockVarianceCount > 0) {
      session.status = 'DISCREPANCY_FLAGGED';
    } else {
      session.status = 'RECONCILED';
    }

    return session;
  }
}
