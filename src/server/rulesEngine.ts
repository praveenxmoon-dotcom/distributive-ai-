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
 * 1. Must be authenticated with role 'SUPPLY_CHAIN_MANAGER'
 * 2. Proposal must be in 'SUBMITTED' status (never decide draft, rejected, or executed proposals)
 * 3. Separation of Duties (Four-Eyes Principle): Proposer or any material modifier CANNOT approve their own plan.
 */
export function validateProposalApproval(actor: User, proposal: RecoveryProposal): RuleValidationResult {
  // Rule 1: Authenticated role check
  if (actor.role !== 'SUPPLY_CHAIN_MANAGER') {
    return {
      allowed: false,
      code: 'UNAUTHORIZED_ROLE',
      message: `Permission Denied: Only authenticated users with the 'SUPPLY_CHAIN_MANAGER' role can approve or reject recovery proposals. Current user '${actor.name}' has role '${actor.role}'.`
    };
  }

  // Rule 2: Valid status check
  if (proposal.status !== 'SUBMITTED') {
    return {
      allowed: false,
      code: 'INVALID_STATUS_FOR_APPROVAL',
      message: `State Transition Error: Only proposals in 'SUBMITTED' status can be approved or rejected. Current status is '${proposal.status}'.`
    };
  }

  // Rule 3: Separation of duties (Four-Eyes Principle)
  // Proposer check
  if (proposal.createdById === actor.id) {
    return {
      allowed: false,
      code: 'SEPARATION_OF_DUTIES_VIOLATION',
      message: `Governance Violation (Maker-Checker Policy): The proposal creator (${proposal.createdByName}) cannot approve their own plan. An independent Supply Chain Manager must perform authorization.`
    };
  }

  // Material modifier check
  if (proposal.lastModifiedById === actor.id || (proposal.modifierUserIds && proposal.modifierUserIds.includes(actor.id))) {
    return {
      allowed: false,
      code: 'MODIFIER_CANNOT_APPROVE_VIOLATION',
      message: `Governance Violation (Maker-Checker Policy): User '${actor.name}' materially modified this recovery proposal (v${proposal.version}) and cannot approve their own modifications. An independent Supply Chain Manager must review.`
    };
  }

  return { allowed: true };
}

/**
 * Applies a material modification to a recovery proposal.
 * Critical Business Rule: Material modifications MUST increment the proposal version
 * and invalidate any existing approval, reverting the status to SUBMITTED for re-review.
 */
export function applyProposalModification(
  db: Database,
  proposal: RecoveryProposal,
  actor: User,
  actionId: string,
  modifications: {
    transportMode?: any;
    carrierName?: string;
    notes?: string;
    quantityToRecover?: number;
  }
): RecoveryProposal {
  if (proposal.status === 'SIMULATED_EXECUTED') {
    throw new Error(`Cannot modify proposal '${proposal.id}': Proposal has already been executed in simulation mode.`);
  }

  const action = proposal.actions.find(a => a.id === actionId);
  if (!action) {
    throw new Error(`Action leg '${actionId}' not found in proposal '${proposal.id}'.`);
  }

  const priorStatus = proposal.status;
  const priorVersion = proposal.version;

  // Apply changes
  if (modifications.transportMode) action.transportMode = modifications.transportMode;
  if (modifications.carrierName) action.carrierName = modifications.carrierName;
  if (modifications.notes) action.notes = modifications.notes;
  if (modifications.quantityToRecover !== undefined && modifications.quantityToRecover > 0) {
    action.quantityToRecover = modifications.quantityToRecover;
  }

  // Revalidate stock if company warehouse is involved
  if (action.sourceLocationType === 'COMPANY_WAREHOUSE' && action.sourceWarehouseId) {
    const inv = db.getInventoryItem(action.sourceWarehouseId, action.sku);
    if (inv) {
      const available = inv.quantityOnHand - inv.reservedQuantity;
      action.stockAvailableAtSource = available;
      action.stockOnHandAtSource = inv.quantityOnHand;
      action.stockValidationStatus = available >= action.quantityToRecover ? 'VERIFIED_AVAILABLE' : 'INSUFFICIENT_STOCK';
    }
  }

  // Increment version
  proposal.version = (proposal.version || 1) + 1;
  proposal.lastModifiedById = actor.id;
  proposal.lastModifiedByName = actor.name;
  proposal.lastModifiedByRole = actor.role;
  proposal.lastModifiedAt = new Date().toISOString();
  proposal.updatedAt = new Date().toISOString();

  if (!proposal.modifierUserIds) proposal.modifierUserIds = [];
  if (!proposal.modifierUserIds.includes(actor.id)) {
    proposal.modifierUserIds.push(actor.id);
  }

  if (!proposal.modificationHistory) proposal.modificationHistory = [];
  proposal.modificationHistory.push({
    version: proposal.version,
    modifiedByUserId: actor.id,
    modifiedByUserName: actor.name,
    modifiedByUserRole: actor.role,
    timestamp: new Date().toISOString(),
    description: `Action leg ${action.orderNumber} modified by ${actor.name} (${actor.role}). Transport: ${action.transportMode}, Carrier: ${action.carrierName}.`
  });

  // If proposal was previously APPROVED, material modification INVALIDATES the approval!
  let approvalInvalidated = false;
  if (priorStatus === 'APPROVED') {
    proposal.status = 'SUBMITTED';
    proposal.approvalDecision = undefined;
    approvalInvalidated = true;

    recordAuditLog(
      db,
      'PROPOSAL_APPROVAL_INVALIDATED',
      actor,
      'PROPOSAL',
      proposal.id,
      `[GOVERNANCE] Prior approval on proposal '${proposal.title}' was invalidated due to material modifications made by ${actor.name} (${actor.role}). Status reverted to SUBMITTED for re-approval (new v${proposal.version}).`,
      {
        previousVersion: priorVersion,
        newVersion: proposal.version,
        modifiedBy: actor.name,
        actionId
      },
      true
    );
  }

  db.updateProposal(proposal);

  recordAuditLog(
    db,
    'PROPOSAL_MODIFIED',
    actor,
    'PROPOSAL',
    proposal.id,
    `Proposal '${proposal.title}' modified to v${proposal.version} by ${actor.name} (${actor.role}). Action leg ${action.orderNumber} updated.`,
    {
      actionId,
      version: proposal.version,
      approvalInvalidated,
      modifications
    },
    true
  );

  return proposal;
}

/**
 * Enforces business rules for Execution in Simulation Mode:
 * 1. Proposal MUST be in APPROVED status (never execute draft, submitted, or rejected plan)
 * 2. Cannot execute an already executed plan (prevent duplicate execution)
 * 3. The current proposal version MUST match the exact approved version
 * 4. Immediate stock re-validation: real available stock must exist in the database right now,
 *    and quantityOnHand - required must be >= 0 (prevent negative inventory under all conditions).
 */
export function validateProposalExecution(actor: User, proposal: RecoveryProposal, db: Database): RuleValidationResult {
  // Rule 1: Prevent duplicate execution
  if (proposal.status === 'SIMULATED_EXECUTED' || proposal.executionResult) {
    return {
      allowed: false,
      code: 'DUPLICATE_EXECUTION_BLOCKED',
      message: `Execution Blocked: Proposal '${proposal.title}' has already been executed on ${proposal.executionResult?.executedAt || 'earlier run'}. Duplicate execution is prohibited.`
    };
  }

  // Rule 2: Strict approval prerequisite
  if (proposal.status !== 'APPROVED') {
    return {
      allowed: false,
      code: 'UNAPPROVED_PLAN_BLOCKED',
      message: `Execution Blocked: Policy strictly prohibits executing unapproved or rejected proposals. Proposal '${proposal.title}' is currently in '${proposal.status}' status (must be 'APPROVED').`
    };
  }

  // Rule 3: Version consistency check
  if (!proposal.approvalDecision || proposal.approvalDecision.approvedVersion !== proposal.version) {
    return {
      allowed: false,
      code: 'STALE_APPROVAL_VERSION_MISMATCH',
      message: `Execution Blocked: Proposal approval is stale. Approved version was v${proposal.approvalDecision?.approvedVersion ?? 'unknown'}, but current proposal version is v${proposal.version}. Material modifications require re-approval.`
    };
  }

  // Rule 4: Immediate Stock Availability Re-validation (Prevent Negative Inventory)
  for (const action of proposal.actions) {
    if (action.strategy === 'WAIT_ORIGINAL_REPAIR') continue;

    // Check company warehouse inventory
    if (action.sourceLocationType === 'COMPANY_WAREHOUSE' && action.sourceWarehouseId) {
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
          message: `Execution Aborted: Insufficient unreserved stock for SKU ${action.sku} at ${action.sourceWarehouseName || action.sourceWarehouseId}. Required: ${action.quantityToRecover}, Available: ${available} (On Hand: ${inv.quantityOnHand}, Reserved: ${inv.reservedQuantity}).`
        };
      }

      // Explicit negative inventory check
      if (inv.quantityOnHand - action.quantityToRecover < 0) {
        return {
          allowed: false,
          code: 'NEGATIVE_INVENTORY_PREVENTED',
          message: `Execution Aborted: Negative inventory violation. Deduction of ${action.quantityToRecover} units would result in negative stock for SKU ${action.sku} (Current on-hand: ${inv.quantityOnHand}).`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Execute approved recovery proposal in SIMULATION MODE:
 * Atomically updates inventories, dispatches simulated recovery shipments, updates affected orders, and records comprehensive audit trail.
 */
export function executeProposalSimulation(
  db: Database,
  proposal: RecoveryProposal,
  actor: User
): RecoveryProposal {
  // Pre-execution validation
  const validation = validateProposalExecution(actor, proposal, db);
  if (!validation.allowed) {
    recordAuditLog(
      db,
      'EXECUTION_BLOCKED_POLICY_VIOLATION',
      actor,
      'PROPOSAL',
      proposal.id,
      `Blocked simulated execution attempt on proposal '${proposal.title}': ${validation.message}`,
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

  // Process each recovery action leg
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

    // Deduct stock from company warehouse if applicable
    if (action.sourceLocationType === 'COMPANY_WAREHOUSE' && action.sourceWarehouseId) {
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

        recordAuditLog(
          db,
          'INVENTORY_REALLOCATED',
          actor,
          'INVENTORY',
          inv.id,
          `[SIMULATED EXECUTION] Deducted ${action.quantityToRecover} units of ${inv.productName} (${inv.sku}) from ${sourceWh?.name || inv.warehouseId}. New available: ${inv.availableQuantity} units.`,
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
      originWarehouseId: action.sourceWarehouseId || 'wh-del-01',
      destinationWarehouseId: action.targetWarehouseId,
      carrier: action.carrierName,
      vehicleType: action.transportMode === 'AIR_CARGO' 
        ? 'Boeing 737-800F Dedicated Air Freighter' 
        : action.transportMode === 'RELIEF_HAULER_HIGHWAY'
          ? 'Apex Emergency Relief Prime-Mover (Tata Signa 5530.S)'
          : 'Dedicated Express Sprinter Van',
      vehicleRegistration: action.transportMode === 'AIR_CARGO' ? 'VT-BDG' : 'MH-31-TR-8810',
      driverName: action.transportMode === 'AIR_CARGO' ? 'Capt. Sandeep Menon (Flight Dispatch)' : 'Harishankar Tiwari (Relief Driver)',
      driverPhone: '+91 94221 40911',
      routeCorridor: action.transportMode === 'AIR_CARGO' 
        ? 'DEL-MAA Air Cargo Direct Sector' 
        : 'NH-44 Nagpur Highway Transit Waypoint to Chennai Dock',
      totalDistanceKm: action.transportMode === 'AIR_CARGO' ? 1750 : 1438,
      distanceTraveledKm: 0,
      status: 'IN_TRANSIT',
      departureTime: new Date().toISOString(),
      originalEta: action.newProjectedEta,
      currentEta: action.newProjectedEta,
      delayHours: 0,
      milestones: [
        {
          id: `ms-${recShipmentId}-01`,
          locationName: action.sourceLocationDetails,
          coordinates: { lat: 20.5600, lng: 78.8400 },
          status: 'COMPLETED',
          plannedTimestamp: new Date().toISOString(),
          actualTimestamp: new Date().toISOString()
        },
        {
          id: `ms-${recShipmentId}-02`,
          locationName: 'Chennai Fulfillment Hub (MAA-DC-02) Priority Receiving Dock',
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
      order.riskAssessment.explanation = `RECOVERED VIA ${action.strategy} (${action.transportMode}). Projected arrival ${new Date(action.newProjectedEta).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST arrives ahead of committed SLA deadline.`;
    }
    db.updateOrder(order);
    ordersUpdatedCount++;
  }

  // Update original shipment state
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

  const execAudit = recordAuditLog(
    db,
    'SIMULATION_EXECUTION_COMPLETED',
    actor,
    'PROPOSAL',
    proposal.id,
    `[SIMULATED EXECUTION] Executed recovery plan '${proposal.title}' (v${proposal.version}). Dispatched ${generatedShipments.length} simulated shipments, adjusted inventory for ${inventoryAdjustments.length} company SKUs, and restored ${ordersUpdatedCount} orders to SLA compliance.`,
    {
      proposalId: proposal.id,
      version: proposal.version,
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
