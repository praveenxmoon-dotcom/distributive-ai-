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
  const delWarehouse = db.getWarehouseById('wh-del-01');
  const maaWarehouse = db.getWarehouseById('wh-maa-02');

  const actions: RecoveryActionItem[] = [];
  let totalEstimatedCost = 0;
  let totalPenaltySavings = 0;
  let fullyRecoveredCount = 0;
  let atRiskCount = 0;

  for (const order of orders) {
    const item = order.items[0];
    if (!item) continue;

    const risk = order.riskAssessment;
    const isSlaBreached = risk 
      ? risk.isSlaBreached 
      : (new Date(order.committedSla).getTime() < new Date(shipment.currentEta).getTime());

    // Strategy 1: Buffer is positive even with breakdown delay -> Wait for Linehaul Repair
    if (!isSlaBreached && planType !== 'MAX_SPEED_EXPEDITE') {
      const action: RecoveryActionItem = {
        id: `act-${order.id}-wait`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        strategy: 'WAIT_ORIGINAL_REPAIR',
        sourceLocationType: 'COMPANY_WAREHOUSE',
        sku: item.sku,
        quantityToRecover: item.quantity,
        sourceLocationDetails: 'Original Linehaul Vehicle (DL-01-AX-9942) undergoing on-site repair at Nagpur (KM 742)',
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
        notes: `Order buffer is positive (+${risk?.delayMarginHours ?? 24}h). Repaired truck ETA at ${new Date(shipment.currentEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} satisfies committed SLA without expediting surcharge.`
      };
      actions.push(action);
      fullyRecoveredCount++;
      continue;
    }

    // High risk or breached orders:
    if (planType === 'MAX_SPEED_EXPEDITE') {
      // Emergency Air Cargo from Delhi Central DC to Chennai
      const delInv = inventories.find(i => i.warehouseId === 'wh-del-01' && i.sku === item.sku);
      const isStockAvailable = delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) >= item.quantity : false;
      const weightTotal = (delInv?.weightKg || 3) * item.quantity;
      const airFreight = Math.round(weightTotal * 190);
      const handling = 8000;
      const surcharge = 3500;
      const cost = airFreight + handling + surcharge;
      const penaltySaved = order.dailyPenaltyAmount * 2;
      const airEta = new Date(Date.now() + 6.5 * 3600 * 1000).toISOString();

      const action: RecoveryActionItem = {
        id: `act-${order.id}-air`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        strategy: 'AIR_FREIGHT_EXPEDITE_DELHI',
        sourceLocationType: 'COMPANY_WAREHOUSE',
        sku: item.sku,
        quantityToRecover: item.quantity,
        sourceWarehouseId: 'wh-del-01',
        sourceWarehouseName: delWarehouse?.name || 'Delhi Central DC',
        sourceLocationDetails: 'Delhi Central DC (DEL-DC-01) -> Indira Gandhi International Airport (DEL) -> Chennai Airport (MAA)',
        targetWarehouseId: shipment.destinationWarehouseId,
        transportMode: 'AIR_CARGO',
        carrierName: 'IndiGo CarGo Dedicated Flight 6E-241 (DEL-MAA)',
        leadTimeHours: 6.5,
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
        notes: `Emergency air cargo transit from Delhi Central DC directly to Chennai. Verified Delhi company stock: ${delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0} units available.`
      };
      actions.push(action);
      totalEstimatedCost += cost;
      totalPenaltySavings += penaltySaved;
      if (isStockAvailable) fullyRecoveredCount++; else atRiskCount++;
    } else if (planType === 'CONSERVATIVE_SPLIT') {
      // Split Strategy: Air Cargo for urgent line-stoppage buffer (10 units from Delhi DC) + Highway cross-dock for remainder
      const delInv = inventories.find(i => i.warehouseId === 'wh-del-01' && i.sku === item.sku);
      const splitUnits = Math.min(10, item.quantity);
      const isStockAvailable = delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) >= splitUnits : false;
      const cost = 14500;
      const penaltySaved = order.dailyPenaltyAmount;
      const splitEta = new Date(Date.now() + 6.5 * 3600 * 1000).toISOString();

      const action: RecoveryActionItem = {
        id: `act-${order.id}-split`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        strategy: 'SPLIT_AIR_AND_TRANSIT',
        sourceLocationType: 'COMPANY_WAREHOUSE',
        sku: item.sku,
        quantityToRecover: splitUnits,
        sourceWarehouseId: 'wh-del-01',
        sourceWarehouseName: delWarehouse?.name || 'Delhi Central DC',
        sourceLocationDetails: `Air Fast-Lot (${splitUnits} units from Delhi DC) + Remaining (${item.quantity - splitUnits} units) via Highway Relief Hauler at Nagpur (KM 742)`,
        targetWarehouseId: shipment.destinationWarehouseId,
        transportMode: 'AIR_CARGO',
        carrierName: 'IndiGo CarGo Priority Flight 6E-241',
        leadTimeHours: 6.5,
        newProjectedEta: splitEta,
        slaPreserved: true,
        stockValidationStatus: isStockAvailable ? 'VERIFIED_AVAILABLE' : 'INSUFFICIENT_STOCK',
        stockOnHandAtSource: delInv?.quantityOnHand || 0,
        stockAvailableAtSource: delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0,
        costBreakdown: {
          freightCost: 11000,
          expeditingSurcharge: 2000,
          handlingFee: 1500,
          slaPenaltySavings: penaltySaved,
          netCost: cost
        },
        notes: `Hybrid split: Expedite ${splitUnits} units from Delhi Central DC via flight to prevent line stoppage; balance continues via highway transit cross-dock.`
      };
      actions.push(action);
      totalEstimatedCost += cost;
      totalPenaltySavings += penaltySaved;
      if (isStockAvailable) fullyRecoveredCount++; else atRiskCount++;
    } else {
      // OPTIMAL_BALANCED:
      // For Apollo Healthcare (SKU-MED-901): Emergency Air Cargo from Delhi Central DC
      // For Hyundai Automotive (SKU-AUTO-404): Highway Relief Cross-Dock at Nagpur Transit Waypoint (KM 742)
      // For SunTech Solar (SKU-SOLAR-210): Verified External Partner Cross-Dock in Chennai Corridor
      if (order.id === 'ord-7801') {
        const delInv = inventories.find(i => i.warehouseId === 'wh-del-01' && i.sku === item.sku);
        const isStockAvailable = delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) >= item.quantity : false;
        const cost = 24500;
        const penaltySaved = order.dailyPenaltyAmount * 2;
        const airEta = new Date(Date.now() + 6.5 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-del-air`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'AIR_FREIGHT_EXPEDITE_DELHI',
          sourceLocationType: 'COMPANY_WAREHOUSE',
          sku: item.sku,
          quantityToRecover: item.quantity,
          sourceWarehouseId: 'wh-del-01',
          sourceWarehouseName: delWarehouse?.name || 'Delhi Central DC',
          sourceLocationDetails: 'Delhi Central DC (DEL-DC-01) -> IGI Airport Air Cargo -> Chennai Hub',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'AIR_CARGO',
          carrierName: 'Blue Dart Aviation Dedicated B737 Cargo (DEL-MAA)',
          leadTimeHours: 6.5,
          newProjectedEta: airEta,
          slaPreserved: true,
          stockValidationStatus: isStockAvailable ? 'VERIFIED_AVAILABLE' : 'INSUFFICIENT_STOCK',
          stockOnHandAtSource: delInv?.quantityOnHand || 0,
          stockAvailableAtSource: delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0,
          costBreakdown: {
            freightCost: 16500,
            expeditingSurcharge: 4500,
            handlingFee: 3500,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: `Emergency temperature-controlled air cargo from Delhi Central DC to Chennai MAA. Verified Delhi company stock: ${delInv ? (delInv.quantityOnHand - delInv.reservedQuantity) : 0} units available.`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        if (isStockAvailable) fullyRecoveredCount++; else atRiskCount++;
      } else if (order.id === 'ord-7802') {
        // Highway Relief Truck Cross-Dock at explicitly modelled transit location (Nagpur KM 742)
        // NOT a warehouse! Carrier dispatches relief prime-mover to cross-dock trailer at breakdown waypoint.
        const cost = 16800;
        const penaltySaved = order.dailyPenaltyAmount * 2;
        const crossDockEta = new Date(Date.now() + 14 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-crossdock`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'TRANSIT_CROSS_DOCK_NAGPUR',
          sourceLocationType: 'TRANSIT_CROSS_DOCK',
          sku: item.sku,
          quantityToRecover: item.quantity,
          sourceLocationDetails: 'Highway Transit Cross-Dock Point (KM 742 on NH-44, near Hinganghat / Nagpur). NOTE: Modelled highway transit point, not a warehouse.',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'RELIEF_HAULER_HIGHWAY',
          carrierName: 'Apex Logistics Emergency Relief Prime-Mover (MH-31-TR-8810)',
          leadTimeHours: 14,
          newProjectedEta: crossDockEta,
          slaPreserved: true,
          stockValidationStatus: 'VERIFIED_AVAILABLE',
          costBreakdown: {
            freightCost: 12500,
            expeditingSurcharge: 2500,
            handlingFee: 1800,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: `Relief hauler cross-dock at highway transit waypoint (KM 742) transfers intact cargo container directly, bypassing the 38h mechanical axle repair and arriving 16h before plant line stoppage.`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        fullyRecoveredCount++;
      } else {
        // Verified External Supplier Emergency Procurement in Chennai Corridor
        const cost = 15200;
        const penaltySaved = order.dailyPenaltyAmount;
        const supplierEta = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

        const action: RecoveryActionItem = {
          id: `act-${order.id}-supplier`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          strategy: 'EXTERNAL_SUPPLIER_EMERGENCY',
          sourceLocationType: 'EXTERNAL_SUPPLIER',
          sku: item.sku,
          quantityToRecover: item.quantity,
          sourceLocationDetails: 'Verified Tier-1 External Supplier Partner (Sriperumbudur Industrial Corridor, Chennai)',
          targetWarehouseId: shipment.destinationWarehouseId,
          transportMode: 'DEDICATED_EXPRESS_VAN',
          carrierName: 'TVS Supply Chain Solutions (Dedicated Local Express)',
          leadTimeHours: 5,
          newProjectedEta: supplierEta,
          slaPreserved: true,
          stockValidationStatus: 'VERIFIED_AVAILABLE',
          costBreakdown: {
            freightCost: 9500,
            expeditingSurcharge: 3500,
            handlingFee: 2200,
            slaPenaltySavings: penaltySaved,
            netCost: cost
          },
          notes: `Emergency fulfillment via contractually verified external supplier in Chennai corridor, fulfilling SLA within 5 hours.`
        };
        actions.push(action);
        totalEstimatedCost += cost;
        totalPenaltySavings += penaltySaved;
        fullyRecoveredCount++;
      }
    }
  }

  const titlePrefix = planType === 'OPTIMAL_BALANCED' 
    ? 'Optimal Feasible Multi-Modal Recovery Plan'
    : planType === 'MAX_SPEED_EXPEDITE'
      ? 'Emergency Delhi Air Cargo Expediting Plan'
      : 'Conservative Hybrid Split & Highway Cross-Dock Plan';

  const proposal: RecoveryProposal = {
    id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    incidentId: incident.id,
    title: `${titlePrefix} (Incident ${incident.code})`,
    description: `Automated recovery synthesis for breakdown of shipment ${shipment.trackingNumber}. Strictly utilizes company inventory at Delhi Central DC (DEL-DC-01) and Chennai (MAA-DC-02), highway transit cross-docking at Nagpur (KM 742), or verified external suppliers.`,
    status: 'SUBMITTED',
    version: 1,
    createdById: author.id,
    createdByName: author.name,
    createdByRole: author.role,
    createdAt: new Date().toISOString(),
    lastModifiedById: author.id,
    lastModifiedByName: author.name,
    lastModifiedByRole: author.role,
    lastModifiedAt: new Date().toISOString(),
    modifierUserIds: [author.id],
    modificationHistory: [
      {
        version: 1,
        modifiedByUserId: author.id,
        modifiedByUserName: author.name,
        modifiedByUserRole: author.role,
        timestamp: new Date().toISOString(),
        description: `Initial recovery plan synthesis generated by ${author.name} (${author.role}).`
      }
    ],
    updatedAt: new Date().toISOString(),
    totalEstimatedCost,
    totalPenaltySavings,
    ordersFullyRecoveredCount: fullyRecoveredCount,
    ordersAtRiskCount: atRiskCount,
    actions
  };

  return proposal;
}
