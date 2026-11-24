import { db } from '../../db/mockDatabase';
import { BouncedCheckEvent, Customer } from '../../types';

export interface BouncedCheckPayload {
  tenantId: string;
  customerId: string;
  checkNumber: string;
  bankName: string;
  amount: number;
  dueDate: string;
  returnReasonCode: 'INSUFFICIENT_FUNDS' | 'SIGNATURE_MISMATCH' | 'ACCOUNT_CLOSED' | 'STOP_PAYMENT';
  handledBy: string;
}

export class CreditLockService {
  /**
   * Processes a bounced bank check, records the default event,
   * and triggers an immediate credit lockdown on the customer.
   */
  public static processBouncedCheck(payload: BouncedCheckPayload): {
    event: BouncedCheckEvent;
    customer: Customer;
    actionTaken: string;
  } {
    const customer = db.customers.find(
      (c) => c.id === payload.customerId && c.tenantId === payload.tenantId
    );

    if (!customer) {
      throw new Error(`Customer '${payload.customerId}' not found for tenant '${payload.tenantId}'.`);
    }

    const event: BouncedCheckEvent = {
      id: `chk-bounce-${Date.now()}`,
      tenantId: payload.tenantId,
      customerId: payload.customerId,
      checkNumber: payload.checkNumber,
      bankName: payload.bankName,
      amount: payload.amount,
      dueDate: payload.dueDate,
      returnDate: new Date().toISOString().split('T')[0],
      returnReasonCode: payload.returnReasonCode,
      handledBy: payload.handledBy,
      isResolved: false,
    };

    db.bouncedChecks.push(event);

    // Apply immediate credit freeze (simulates the PostgreSQL trigger)
    customer.creditLocked = true;
    customer.creditLockTimestamp = new Date().toISOString();
    customer.creditLockReason = `CREDIT FREEZE: Bounced Check #${payload.checkNumber} via ${payload.bankName} (${payload.returnReasonCode}) for AED ${payload.amount.toFixed(2)}`;

    return {
      event,
      customer,
      actionTaken: 'CUSTOMER_CREDIT_LOCKED_PENDING_DISPATCH_FROZEN',
    };
  }

  /**
   * Validates if a customer is eligible for order dispatch based on credit limit and lock status.
   */
  public static validateCreditForOrder(
    tenantId: string,
    customerId: string,
    newOrderAmount: number
  ): { isApproved: boolean; reason?: string } {
    const customer = db.customers.find((c) => c.id === customerId && c.tenantId === tenantId);
    if (!customer) {
      return { isApproved: false, reason: 'Customer record does not exist.' };
    }

    if (customer.creditLocked) {
      return {
        isApproved: false,
        reason: `Order blocked: Customer account is locked. Reason: ${customer.creditLockReason}`,
      };
    }

    const projectedBalance = customer.currentBalance + newOrderAmount;
    if (projectedBalance > customer.creditLimit) {
      return {
        isApproved: false,
        reason: `Order blocked: Credit limit exceeded. Limit: AED ${customer.creditLimit}, Projected: AED ${projectedBalance}`,
      };
    }

    return { isApproved: true };
  }
}
