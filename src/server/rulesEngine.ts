import { 
  User, 
  RecoveryProposal, 
  Shipment, 
  Order, 
  InventoryItem, 
  DisruptionIncident,
  AuditEventType 
} from '../types/index.ts';
import { Database } from './db.ts';
import { recordAuditLog } from './auditService.ts';

export interface RuleValidationResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * Enforces business rules for Proposal Approval / Rejection:
 * 1. Must be a SUPPLY_CHAIN_MANAGER
 * 2. Proposer CANNOT approve their own plan (Four-Eyes Principle / Maker-Checker)
 * 3. Proposal must be in SUBMITTED status
 */
export function validateProposalApproval(actor: User, proposal: RecoveryProposal): RuleValidationResult {
  // Rule 1: Authenticated role check
  if (actor.role !== 'SUPPLY_CHAIN_MANAGER') {
    return {
      allowed: false,
      code: 'UNAUTHORIZED_ROLE',
      message: `Permission Denied: Only users with the 'SUPPLY_CHAIN_MANAGER' role can approve or reject recovery proposals. Current user (${actor.name}) has role '${actor.role}'.`
    };
  }

  // Rule 2: Separation of duties (Four-Eyes Principle)
  if (proposal.createdById === actor.id) {
    return {
      allowed: false,
      code: 'SEPARATION_OF_DUTIES_VIOLATION',
      message: `Governance Violation (Maker-Checker Policy): The proposal creator (${proposal.createdByName}) cannot approve their own plan. A distinct Supply Chain Manager must perform the authorization.`
    };
  }

  // Rule 3: Valid state check
  if (proposal.status !== 'SUBMITTED' && proposal.status !== 'DRAFT') {
    return {
      allowed: false,
      code: 'INVALID_STATUS_TRANSITION',
      message: `State Transition Error: Cannot decide proposal in '${proposal.status}' status. Only SUBMITTED or DRAFT proposals can be decided.`
    };
  }

  return { allowed: true };
}

/**
 * Enforces business rules for Execution in Simulation Mode:
 * 1. Proposal MUST be in APPROVED status (never execute draft, submitted, or rejected plan)
 * 2. Real stock must exist in the database for all reallocated legs
 */
export function validateProposalExecution(actor: User, proposal: RecoveryProposal, db: Database): RuleValidationResult {
  // Rule 1: Strict approval prerequisite
  if (proposal.status !== 'APPROVED') {
    return {
      allowed: false,
      code: 'UNAPPROVED_PLAN_BLOCKED',
      message: `Execution Blocked: Policy prohibits executing unapproved or rejected proposals. Proposal '${proposal.title}' is currently in '${proposal.status}' status (must be 'APPROVED').`
    };
  }

  // Rule 2: Stock Availability Pre-execution Verification
  for (const action of proposal.actions) {
    if (action.strategy === 'WAIT_ORIGINAL_REPAIR') continue;

    if (action.sourceWarehouseId) {
      const inv = db.getInventoryItem(action.sourceWarehouseId, action.sku);
      if (!inv) {
        return {
          allowed: false,
          code: 'STOCK_RECORD_NOT_FOUND',
          message: `Execution Aborted: Stock record not found for SKU ${action.sku} at warehouse ${action.sourceWarehouseName || action.sourceWarehouseId}.`
        };
      }
      const available = inv.quantityOnHand - inv.reservedQuantity;
      if (available < action.quantityToRecover) {
        return {
          allowed: false,
          code: 'INSUFFICIENT_STOCK_VERIFICATION',
          message: `Execution Aborted: Insufficient stock for SKU ${action.sku} at ${action.sourceWarehouseName}. Required: ${action.quantityToRecover}, Available: ${available} (On Hand: ${inv.quantityOnHand}, Reserved: ${inv.reservedQuantity}).`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Execute approved recovery proposal in SIMULATION MODE:
 * Updates inventories, creates simulated rapid shipments, updates affected orders, and records complete audit trail.
 */
export function executeProposalSimulation(
  db: Database,
  proposal: RecoveryProposal,
  actor: User
): RecoveryProposal {
  // Verify execution permission first
  const validation = validateProposalExecution(actor, proposal, db);
  if (!validation.allowed) {
    // Audit policy violation attempt
    recordAuditLog(
      db,
      'EXECUTION_BLOCKED_NOT_APPROVED',
      actor,
      'PROPOSAL',
      proposal.id,
      `Blocked execution attempt on proposal '${proposal.title}': ${validation.message}`,
      { error: validation },
      true
    );
    throw new Error(validation.message);
  }

  const generatedShipments: Array<{
    shipmentId: string;
    carrier: string;
    mode: string;
    eta: string;
    orderId: string;
  }> = [];

  const inventoryAdjustments: Array<{
    warehouseId: string;
    warehouseName: string;
    sku: string;
    quantityDeducted: number;
    remainingAvailable: number;
  }> = [];

  let ordersUpdatedCount = 0;

  // Process all action items consistently
  for (const action of proposal.actions) {
    const order = db.getOrderById(action.orderId);
    if (!order) continue;

    if (action.strategy === 'WAIT_ORIGINAL_REPAIR') {
      order.status = 'ON_SCHEDULE';
      order.estimatedDelivery = action.newProjectedEta;
      db.updateOrder(order);
      ordersUpdatedCount++;
      continue;
    }

    // Deduct stock from source warehouse
    if (action.sourceWarehouseId) {
      const inv = db.getInventoryItem(action.sourceWarehouseId, action.sku);
      if (inv) {
        inv.quantityOnHand -= action.quantityToRecover;
        inv.availableQuantity = inv.quantityOnHand - inv.reservedQuantity;
        db.updateInventoryItem(inv);

        const sourceWh = db.getWarehouseById(action.sourceWarehouseId);
        inventoryAdjustments.push({
          warehouseId: inv.warehouseId,
          warehouseName: sourceWh?.name || inv.warehouseId,
          sku: inv.sku,
          quantityDeducted: action.quantityToRecover,
          remainingAvailable: inv.availableQuantity
        });

        // Audit inventory deduction
        recordAuditLog(
          db,
          'INVENTORY_REALLOCATED',
          actor,
          'INVENTORY',
          inv.id,
          `[SIMULATED EXECUTION] Deducted ${action.quantityToRecover} units of ${inv.productName} (${inv.sku}) from ${sourceWh?.name}. New available: ${inv.availableQuantity} units.`,
          {
            warehouseId: inv.warehouseId,
            sku: inv.sku,
            quantityDeducted: action.quantityToRecover,
            remainingOnHand: inv.quantityOnHand,
            allocatedToOrder: order.orderNumber,
            strategy: action.strategy
          },
          true
        );
      }
    }

    // Create a new simulated recovery shipment
    const recShipmentId = `shp-rec-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`;
    const newShipment: Shipment = {
      id: recShipmentId,
      trackingNumber: `EXP-${action.transportMode.slice(0, 3)}-${recShipmentId.toUpperCase()}`,
      originWarehouseId: action.sourceWarehouseId || 'wh-blr-03',
      destinationWarehouseId: action.targetWarehouseId,
      carrier: action.carrierName,
      vehicleType: action.transportMode === 'AIR_CARGO' ? 'Boeing 737-800F Dedicated Freighter' : 'Force Urbania Express Van',
      vehicleRegistration: action.transportMode === 'AIR_CARGO' ? 'VT-BDG' : 'KA-05-EX-4491',
      driverName: action.transportMode === 'AIR_CARGO' ? 'Capt. Sandeep Menon (Flight Dispatch)' : 'Kishore Kumar (Express Driver)',
      driverPhone: '+91 97412 55901',
      routeCorridor: action.transportMode === 'AIR_CARGO' ? 'DEL-MAA Direct Air Sector' : 'NH-44 / NH-48 Bengaluru to Chennai Rapid Link',
      totalDistanceKm: action.transportMode === 'AIR_CARGO' ? 1750 : 340,
      distanceTraveledKm: 0,
      status: 'IN_TRANSIT',
      departureTime: new Date().toISOString(),
      originalEta: action.newProjectedEta,
      currentEta: action.newProjectedEta,
      delayHours: 0,
      milestones: [
        {
          id: `ms-${recShipmentId}-01`,
          locationName: `${action.sourceWarehouseName || 'Source DC'} - Expedited Dispatch Dock`,
          coordinates: { lat: 12.9716, lng: 77.5946 },
          status: 'COMPLETED',
          plannedTimestamp: new Date().toISOString(),
          actualTimestamp: new Date().toISOString()
        },
        {
          id: `ms-${recShipmentId}-02`,
          locationName: 'Chennai Hub (MAA-DC-02) Inbound Priority Gate',
          coordinates: { lat: 13.0827, lng: 80.2707 },
          status: 'PENDING',
          plannedTimestamp: action.newProjectedEta
        }
      ],
      orderIds: [order.id]
    };

    db.updateShipment(newShipment);

    generatedShipments.push({
      shipmentId: newShipment.id,
      carrier: action.carrierName,
      mode: action.transportMode,
      eta: action.newProjectedEta,
      orderId: order.id
    });

    // Update order status and ETA
    order.status = 'RECOVERED_IN_TRANSIT';
    order.estimatedDelivery = action.newProjectedEta;
    order.shipmentId = newShipment.id;
    if (order.riskAssessment) {
      order.riskAssessment.isSlaBreached = false;
      order.riskAssessment.riskLevel = 'LOW';
      order.riskAssessment.score = 15;
      order.riskAssessment.explanation = `RECOVERED VIA ${action.strategy} (${action.transportMode}). New estimated delivery ${new Date(action.newProjectedEta).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST arrives well ahead of committed SLA.`;
    }
    db.updateOrder(order);
    ordersUpdatedCount++;
  }

  // Update original shipment state to reflect offloaded orders and ongoing repair
  const incident = db.getIncidentById(proposal.incidentId);
  if (incident) {
    incident.status = 'RESOLVING';
    db.updateIncident(incident);

    const originalShipment = db.getShipmentById(incident.shipmentId);
    if (originalShipment) {
      originalShipment.status = 'REPAIR_IN_PROGRESS';
      db.updateShipment(originalShipment);
    }
  }

  // Mark proposal as executed in simulation
  proposal.status = 'SIMULATED_EXECUTED';
  proposal.updatedAt = new Date().toISOString();
  proposal.executionResult = {
    executedByUserId: actor.id,
    executedByUserName: actor.name,
    executedAt: new Date().toISOString(),
    executionMode: 'SIMULATION',
    newShipmentsGenerated: generatedShipments,
    inventoryAdjustments,
    ordersUpdatedCount,
    auditLogId: ''
  };

  db.updateProposal(proposal);

  // Record audit log for execution completion
  const execAudit = recordAuditLog(
    db,
    'SIMULATION_EXECUTION_COMPLETED',
    actor,
    'PROPOSAL',
    proposal.id,
    `[SIMULATION MODE] Executed recovery plan '${proposal.title}'. Dispatched ${generatedShipments.length} expedited shipments, deducted inventory for ${inventoryAdjustments.length} SKUs, and brought ${ordersUpdatedCount} orders back into SLA compliance.`,
    {
      proposalId: proposal.id,
      generatedShipments,
      inventoryAdjustments,
      ordersUpdatedCount,
      totalCost: proposal.totalEstimatedCost,
      penaltySavings: proposal.totalPenaltySavings
    },
    true
  );

  proposal.executionResult.auditLogId = execAudit.id;
  db.updateProposal(proposal);

  return proposal;
}
