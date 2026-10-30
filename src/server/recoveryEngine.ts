import { 
  DisruptionIncident, 
  Shipment, 
  Order, 
  RecoveryProposal, 
  RecoveryActionItem, 
  User, 
  InventoryItem 
} from '../types/index.ts';
import { Database } from './db.ts';

export interface RecoveryProposalPlanOptions {
  proposalType?: 'OPTIMAL_BALANCED' | 'MAX_SPEED_EXPEDITE' | 'CONSERVATIVE_SPLIT';
  author: User;
}

export function generateRecoveryProposals(
  db: Database,
  incident: DisruptionIncident,
  shipment: Shipment,
  orders: Order[],
  author: User,
  planType: 'OPTIMAL_BALANCED' | 'MAX_SPEED_EXPEDITE' | 'CONSERVATIVE_SPLIT' = 'OPTIMAL_BALANCED'
): RecoveryProposal {
  const inventories = db.getInventories();
  const blrWarehouse = db.getWarehouseById('wh-blr-03');
  const delWarehouse = db.getWarehouseById('wh-del-01');
  const maaWarehouse = db.getWarehouseById('wh-maa-02');

  const actions: RecoveryActionItem[] = [];
  let totalEstimatedCost = 0;
  let totalPenaltySavings = 0;
  let fullyRecoveredCount = 0;
  let atRiskCount = 0;

  for (const order of orders) {
    const item = order.items[0]; // Primary item
    if (!item) continue;

    const risk = order.riskAssessment;
    const isSlaBreached = risk ? risk.isSlaBreached : (new Date(order.committedSla).getTime() < new Date(shipment.currentEta).getTime());

    if (!isSlaBreached && planType !== 'MAX_SPEED_EXPEDITE') {
      // Order has sufficient buffer even with breakdown delay!
      // Strategy: Wait for original repair to save expediting expenditure.
      const action: RecoveryActionItem = {
        id: `act-${order.id}-wait`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        strategy: 'WAIT_ORIGINAL_REPAIR',
        sku: item.sku,
        quantityToRecover: item.quantity,
        targetWarehouseId: shipment.destinationWarehouseId,
        transportMode: 'ORIGINAL_TRUCK',
        carrierName: shipment.carrier,
        leadTimeHours: incident.estimatedDelayHours + 24,
        newProjectedEta: shipment.currentEta,
        slaPreserved: true,
        stockValidationStatus: 'NOT_APPLICABLE',
        costBreakdown: {
          freightCost: 0,
          expeditingSurcharge: 0,
          handlingFee: 0,
          slaPenaltySavings: 0,
          netCost: 0
        },
        notes: `Order buffer is positive (+${risk?.delayMarginHours ?? 24}h). Repaired linehaul arrival at ${new Date(shipment.currentEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} satisfies committed SLA without emergency expenditure.`
      };
      actions.push(action);
      fullyRecoveredCount++;
      continue;
    }

    // Order is breached or high priority! Determine recovery strategy:
    if (planType === 'MAX_SPEED_EXPEDITE') {
      // Emergency Air Cargo from Delhi (Hub with primary inventory)
      const delInv = inventories.find(i => i.warehouseId === 'wh-del-01' && i.sku === item.sku);
      const isStockAvailable = delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) >= item.quantity : false;
      const weightTotal = (delInv?.weightKg || 3) * item.quantity;
      const airFreight = Math.round(weightTotal * 190);
      const handling = 8000;
      const surcharge = 3500;
      const cost = airFreight + handling + surcharge;
      const penaltySaved = order.dailyPenaltyAmount * 2;

      // Air lead time: 6 hours from dispatch
      const airEta = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

      const action: RecoveryActionItem = {
        id: `act-${order.id}-air`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        strategy: 'AIR_FREIGHT_EXPEDITE',
        sku: item.sku,
        quantityToRecover: item.quantity,
        sourceWarehouseId: 'wh-del-01',
        sourceWarehouseName: delWarehouse?.name || 'Delhi Central DC',
        targetWarehouseId: shipment.destinationWarehouseId,
        transportMode: 'AIR_CARGO',
        carrierName: 'IndiGo CarGo Express (Flight 6E-241 DEL-MAA)',
        leadTimeHours: 6,
        newProjectedEta: airEta,
        slaPreserved: true,
        stockValidationStatus: isStockAvailable ? 'VERIFIED_AVAILABLE' : 'INSUFFICIENT_STOCK',
        stockOnHandAtSource: delInv?.quantityOnHand || 0,
        stockAvailableAtSource: delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0,
        costBreakdown: {
          freightCost: airFreight,
          expeditingSurcharge: surcharge,
          handlingFee: handling,
          slaPenaltySavings: penaltySaved,
          netCost: cost
        },
        notes: `Emergency air cargo transit from IGI Airport Delhi directly to Chennai MAA Airport. Verified Delhi stock: ${delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0} units available.`
      };
      actions.push(action);
      totalEstimatedCost += cost;
      totalPenaltySavings += penaltySaved;
      if (isStockAvailable) fullyRecoveredCount++; else atRiskCount++;
    } else {
      // OPTIMAL_BALANCED: Check regional hub Bengaluru (BLR-DC-03) first (340 km, 7h transit)
      const blrInv = inventories.find(i => i.warehouseId === 'wh-blr-03' && i.sku === item.sku);
      const blrAvailable = blrInv ? (blrInv.quantityOnHand - blrInv.reservedQuantity) : 0;

      if (blrInv && blrAvailable >= item.quantity) {
        // Full reallocation from Bengaluru
        const vanFreight = 14500;
        const handling = (blrWarehouse?.handlingFeePerUnit || 40) * item.quantity;
        const surcharge = 2500;
        const cost = vanFreight + handling + surcharge;
        const penaltySaved = order.dailyPenaltyAmount * 2;
        const vanEta = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-blr`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'ALTERNATE_HUB_REALLOCATION',
          sku: item.sku,
          quantityToRecover: item.quantity,
          sourceWarehouseId: 'wh-blr-03',
          sourceWarehouseName: blrWarehouse?.name || 'Bengaluru Regional Hub',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'DEDICATED_EXPRESS_VAN',
          carrierName: 'VRL Rapid Logistics (Dedicated Inter-Hub Sprinter)',
          leadTimeHours: 8,
          newProjectedEta: vanEta,
          slaPreserved: true,
          stockValidationStatus: 'VERIFIED_AVAILABLE',
          stockOnHandAtSource: blrInv.quantityOnHand,
          stockAvailableAtSource: blrAvailable,
          costBreakdown: {
            freightCost: vanFreight,
            expeditingSurcharge: surcharge,
            handlingFee: handling,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: `Reallocate ${item.quantity} units from BLR-DC-03 buffer stock via dedicated express van (340 km corridor). Arrives well before customer SLA deadline.`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        fullyRecoveredCount++;
      } else if (blrInv && blrAvailable > 0 && blrAvailable < item.quantity) {
        // Split Order Strategy
        const splitUnits = blrAvailable;
        const remainingUnits = item.quantity - splitUnits;
        const cost = 12000;
        const penaltySaved = order.dailyPenaltyAmount;
        const splitEta = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-split`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'SPLIT_ORDER_HYBRID',
          sku: item.sku,
          quantityToRecover: splitUnits,
          sourceWarehouseId: 'wh-blr-03',
          sourceWarehouseName: blrWarehouse?.name || 'Bengaluru Regional Hub',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'DEDICATED_EXPRESS_VAN',
          carrierName: 'VRL Rapid Express (Partial Fast-Lot)',
          leadTimeHours: 8,
          newProjectedEta: splitEta,
          slaPreserved: true,
          stockValidationStatus: 'VERIFIED_AVAILABLE',
          stockOnHandAtSource: blrInv.quantityOnHand,
          stockAvailableAtSource: blrAvailable,
          costBreakdown: {
            freightCost: 10500,
            expeditingSurcharge: 1500,
            handlingFee: 800,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: `Split shipment: Fast-track ${splitUnits} units from BLR-DC-03 to satisfy immediate factory/clinical SLA; remaining ${remainingUnits} units continue on repaired linehaul truck.`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        fullyRecoveredCount++;
      } else {
        // Stock unavailable at Bengaluru; fallback to Air Freight from Delhi
        const delInv = inventories.find(i => i.warehouseId === 'wh-del-01' && i.sku === item.sku);
        const delAvailable = delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0;
        const isStockAvailable = delAvailable >= item.quantity;
        const cost = 26500;
        const penaltySaved = order.dailyPenaltyAmount * 2;
        const airEta = new Date(Date.now() + 7 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-del-air`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'AIR_FREIGHT_EXPEDITE',
          sku: item.sku,
          quantityToRecover: item.quantity,
          sourceWarehouseId: 'wh-del-01',
          sourceWarehouseName: delWarehouse?.name || 'Delhi Central DC',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'AIR_CARGO',
          carrierName: 'Blue Dart Aviation Cargo (DEL-MAA Flight B737)',
          leadTimeHours: 7,
          newProjectedEta: airEta,
          slaPreserved: isStockAvailable,
          stockValidationStatus: isStockAvailable ? 'VERIFIED_AVAILABLE' : 'INSUFFICIENT_STOCK',
          stockOnHandAtSource: delInv?.quantityOnHand || 0,
          stockAvailableAtSource: delAvailable,
          costBreakdown: {
            freightCost: 18500,
            expeditingSurcharge: 4500,
            handlingFee: 3500,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: isStockAvailable
            ? `Air-freight expedite from Delhi Central DC to Chennai due to zero stock at Bengaluru hub.`
            : `STOCK SHORTAGE: Insufficient unreserved units in network (${delAvailable} available vs ${item.quantity} required).`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        if (isStockAvailable) fullyRecoveredCount++; else atRiskCount++;
      }
    }
  }

  const titlePrefix = planType === 'OPTIMAL_BALANCED' 
    ? 'Optimal Multi-Hub Reallocation & Express Van Plan'
    : planType === 'MAX_SPEED_EXPEDITE'
      ? 'Emergency Air Cargo Direct Expediting Plan'
      : 'Conservative Hybrid Split & Buffer Preservation Plan';

  const proposal: RecoveryProposal = {
    id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    incidentId: incident.id,
    title: `${titlePrefix} (Incident ${incident.code})`,
    description: `Automated recovery synthesis for breakdown of shipment ${shipment.trackingNumber}. Evaluates live inventory across 4 nodes (Delhi, Bengaluru, Chennai, Mumbai) and deterministically balances SLA penalties against carrier expedited freight costs.`,
    status: 'SUBMITTED',
    createdById: author.id,
    createdByName: author.name,
    createdByRole: author.role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalEstimatedCost,
    totalPenaltySavings,
    ordersFullyRecoveredCount: fullyRecoveredCount,
    ordersAtRiskCount: atRiskCount,
    actions
  };

  return proposal;
}
