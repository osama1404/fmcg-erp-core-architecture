import { db } from '../../db/mockDatabase';
import { FEFOAllocationRequest, FEFOAllocationResponse, BatchAllocationResult } from '../../types';

export class FEFOAllocator {
  /**
   * Allocates batches for requested products adhering strictly to First-Expired, First-Out (FEFO).
   * Earliest expiring non-quarantined batches are consumed first.
   */
  public static allocateOrder(request: FEFOAllocationRequest): FEFOAllocationResponse[] {
    const today = new Date().toISOString().split('T')[0];
    const results: FEFOAllocationResponse[] = [];

    for (const item of request.items) {
      let remainingNeeded = item.quantity;
      const batchAllocations: BatchAllocationResult[] = [];

      // Fetch matching batches for tenant, warehouse, product
      const eligibleBatches = db.batches
        .filter(
          (b) =>
            b.tenantId === request.tenantId &&
            b.warehouseId === request.warehouseId &&
            b.productId === item.productId &&
            !b.isQuarantined &&
            b.expiryDate >= today &&
            b.quantityOnHand - b.quantityAllocated > 0
        )
        // Sort ASCENDING by expiry date (FEFO core rule)
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

      for (const batch of eligibleBatches) {
        if (remainingNeeded <= 0) break;

        const availableInBatch = batch.quantityOnHand - batch.quantityAllocated;
        const take = Math.min(availableInBatch, remainingNeeded);

        // Mutate allocation
        batch.quantityAllocated += take;
        remainingNeeded -= take;

        const daysUntilExpiry = Math.ceil(
          (new Date(batch.expiryDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        );

        batchAllocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantityAllocated: take,
          daysUntilExpiry,
        });
      }

      const fulfilledQuantity = item.quantity - remainingNeeded;

      results.push({
        productId: item.productId,
        requestedQuantity: item.quantity,
        fulfilledQuantity,
        isFullyAllocated: remainingNeeded === 0,
        allocations: batchAllocations,
      });
    }

    return results;
  }
}
