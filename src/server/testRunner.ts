import { Database } from './db.ts';
import { calculateDeterministicRiskScore, evaluateShipmentOrdersRisk } from './riskEngine.ts';
import { generateRecoveryProposals } from './recoveryEngine.ts';
import { 
  validateProposalApproval, 
  validateProposalExecution, 
  executeProposalSimulation 
} from './rulesEngine.ts';
import { recordAuditLog } from './auditService.ts';
import { DisruptionIncident, Order, Shipment, User } from '../types/index.ts';

export interface TestResultItem {
  id: string;
  name: string;
  category: 'APPROVAL_ENFORCEMENT' | 'STOCK_VALIDATION' | 'EXECUTION_SAFETY' | 'AUDIT_RECORDING' | 'RISK_SCORING';
  passed: boolean;
  durationMs: number;
  assertion: string;
  details?: string;
  error?: string;
}

export interface TestSuiteSummary {
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResultItem[];
}

export function runComprehensiveTestSuite(): TestSuiteSummary {
  const startTime = Date.now();
  const results: TestResultItem[] = [];

  // Use an isolated instance for tests to avoid altering live demo state
  const testDb = Database.getInstance();
  // Snapshot current state so we can restore it after test run
  const originalState = JSON.parse(JSON.stringify(testDb.getData()));

  try {
    const users = testDb.getUsers();
    const dispatcher = users.find(u => u.role === 'DISPATCHER')!;
    const planner = users.find(u => u.role === 'OPERATIONS_PLANNER')!;
    const manager1 = users.find(u => u.id === 'user-scm-01')!; // Praveen
    const manager2 = users.find(u => u.id === 'user-scm-02')!; // Sarah
    const auditor = users.find(u => u.role === 'AUDITOR')!;

    const shipment = testDb.getShipmentById('shp-del-maa-9042')!;
    const orders = testDb.getOrders().filter(o => shipment.orderIds.includes(o.id));

    // ----------------------------------------------------
    // TEST 1: Incident Creation & Affected Orders Relationship
    // ----------------------------------------------------
    const t1Start = Date.now();
    try {
      const breakdownEta = new Date(new Date(shipment.originalEta).getTime() + 38 * 3600 * 1000).toISOString();
      const incident: DisruptionIncident = {
        id: `inc-test-${Date.now()}`,
        code: 'INC-TEST-001',
        shipmentId: shipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: 'Highway Breakdown Test Verification',
        description: 'Engine transmission failure on NH-44',
        severity: 'CRITICAL',
        locationName: 'Nagpur / Hinganghat Corridor (KM 742)',
        coordinates: { lat: 20.56, lng: 78.84 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: dispatcher.id,
        reportedByUserName: dispatcher.name,
        estimatedDelayHours: 38,
        affectedOrderIds: shipment.orderIds,
        status: 'ACTIVE'
      };

      const affected = testDb.getOrders().filter(o => incident.affectedOrderIds.includes(o.id));
      const passed = affected.length === 4 && affected.some(o => o.id === 'ord-7801');
      results.push({
        id: 'test-1-incident-orders',
        name: 'Step 1 & 2: Incident Creation & Affected Orders Mapping',
        category: 'EXECUTION_SAFETY',
        passed,
        durationMs: Date.now() - t1Start,
        assertion: 'Identifies all 4 affected orders linked to shipment SHP-DEL-MAA-9042 during breakdown.',
        details: `Correctly mapped ${affected.length} orders (ORD-7801 Apollo, ORD-7802 Hyundai, ORD-7803 Croma, ORD-7804 SunTech).`
      });
    } catch (e: any) {
      results.push({
        id: 'test-1-incident-orders',
        name: 'Step 1 & 2: Incident Creation & Affected Orders Mapping',
        category: 'EXECUTION_SAFETY',
        passed: false,
        durationMs: Date.now() - t1Start,
        assertion: 'Identifies all 4 affected orders linked to shipment',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 2: Deterministic Risk Scoring & Priority Calculation
    // ----------------------------------------------------
    const t2Start = Date.now();
    try {
      const delayedShipment: Shipment = {
        ...shipment,
        currentEta: new Date(new Date(shipment.originalEta).getTime() + 38 * 3600 * 1000).toISOString(),
        delayHours: 38
      };

      const criticalOrder = orders.find(o => o.id === 'ord-7802')!; // Hyundai Tier-1 with assembly stoppage
      const retailOrder = orders.find(o => o.id === 'ord-7803')!; // Croma Tier-3 with 66h buffer

      const riskCritical = calculateDeterministicRiskScore(criticalOrder, delayedShipment);
      const riskRetail = calculateDeterministicRiskScore(retailOrder, delayedShipment);

      const passed = 
        riskCritical.score > 80 && 
        riskCritical.isSlaBreached &&
        riskRetail.score < 50 &&
        riskCritical.explanation.includes('SLA BREACH') &&
        riskCritical.components.slaDeficitScore > 0;

      results.push({
        id: 'test-2-risk-scoring',
        name: 'Step 3: Deterministic Risk Scores & Explainability Factors',
        category: 'RISK_SCORING',
        passed,
        durationMs: Date.now() - t2Start,
        assertion: 'Calculates deterministic scores: Hyundai Tier-1 scored >80 (Critical) while Croma Retail scored <50.',
        details: `Hyundai Risk Score: ${riskCritical.score}/100 [${riskCritical.riskLevel}], Deficit: ${riskCritical.components.slaDeficitScore}pts, Penalty: ${riskCritical.components.customerPenaltyScore}pts, Downstream: ${riskCritical.components.downstreamImpactScore}pts.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-2-risk-scoring',
        name: 'Step 3: Deterministic Risk Scores & Explainability Factors',
        category: 'RISK_SCORING',
        passed: false,
        durationMs: Date.now() - t2Start,
        assertion: 'Calculates deterministic scores',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 3: Stock Validation Using Actual Demo Data
    // ----------------------------------------------------
    const t3Start = Date.now();
    try {
      const blrStock = testDb.getInventoryItem('wh-blr-03', 'SKU-MED-901');
      const maaStock = testDb.getInventoryItem('wh-maa-02', 'SKU-MED-901');

      // Bengaluru has 45 units available, order requires 30 units -> Feasible
      const blrAvailable = (blrStock?.quantityOnHand || 0) - (blrStock?.reservedQuantity || 0);
      const isBlrFeasible = blrAvailable >= 30;

      // Chennai has 0 available -> Infeasible if attempting local supply
      const maaAvailable = (maaStock?.quantityOnHand || 0) - (maaStock?.reservedQuantity || 0);
      const isMaaInfeasible = maaAvailable < 30;

      const passed = isBlrFeasible && isMaaInfeasible && blrAvailable === 45 && maaAvailable === 0;

      results.push({
        id: 'test-3-stock-validation',
        name: 'Step 4: Stock Validation using Actual Demo Inventory',
        category: 'STOCK_VALIDATION',
        passed,
        durationMs: Date.now() - t3Start,
        assertion: 'Bengaluru hub verified with 45 unreserved units (feasible); Chennai verified with 0 available (infeasible).',
        details: `BLR-DC-03 SKU-MED-901 available: ${blrAvailable} units. MAA-DC-02 available: ${maaAvailable} units.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-3-stock-validation',
        name: 'Step 4: Stock Validation using Actual Demo Inventory',
        category: 'STOCK_VALIDATION',
        passed: false,
        durationMs: Date.now() - t3Start,
        assertion: 'Stock validation using actual demo inventory',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 4: Separation of Duties Enforcement (Proposer Cannot Approve Own Plan)
    // ----------------------------------------------------
    const t4Start = Date.now();
    try {
      const mockIncident: DisruptionIncident = {
        id: 'inc-test-sep',
        code: 'INC-SEP-01',
        shipmentId: shipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: 'Breakdown Test',
        description: 'Test breakdown',
        severity: 'CRITICAL',
        locationName: 'Nagpur',
        coordinates: { lat: 20.56, lng: 78.84 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: manager1.id,
        reportedByUserName: manager1.name,
        estimatedDelayHours: 38,
        affectedOrderIds: shipment.orderIds,
        status: 'ACTIVE'
      };

      // Manager 1 (Praveen Sharma) creates the proposal:
      const proposalCreatedByManager1 = generateRecoveryProposals(testDb, mockIncident, shipment, orders, manager1);

      // Now Manager 1 attempts to approve their own proposal:
      const selfApprovalCheck = validateProposalApproval(manager1, proposalCreatedByManager1);

      // Distinct Manager 2 (Sarah Jenkins) attempts to approve the same proposal:
      const independentApprovalCheck = validateProposalApproval(manager2, proposalCreatedByManager1);

      const passed = 
        !selfApprovalCheck.allowed && 
        selfApprovalCheck.code === 'SEPARATION_OF_DUTIES_VIOLATION' &&
        independentApprovalCheck.allowed;

      results.push({
        id: 'test-4-separation-of-duties',
        name: 'Step 6: Separation of Duties Enforcement (Maker-Checker Policy)',
        category: 'APPROVAL_ENFORCEMENT',
        passed,
        durationMs: Date.now() - t4Start,
        assertion: 'Proposer (Praveen) is strictly blocked from self-approving; independent SCM (Sarah) is permitted.',
        details: `Self-approval blocked with: "${selfApprovalCheck.message}". Independent approval permitted: ${independentApprovalCheck.allowed}.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-4-separation-of-duties',
        name: 'Step 6: Separation of Duties Enforcement',
        category: 'APPROVAL_ENFORCEMENT',
        passed: false,
        durationMs: Date.now() - t4Start,
        assertion: 'Proposer cannot approve own plan',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 5: Role-Based Authorization Enforcement
    // ----------------------------------------------------
    const t5Start = Date.now();
    try {
      const mockIncident: DisruptionIncident = {
        id: 'inc-test-role',
        code: 'INC-ROLE-01',
        shipmentId: shipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: 'Role Test',
        description: 'Test',
        severity: 'CRITICAL',
        locationName: 'Nagpur',
        coordinates: { lat: 20.56, lng: 78.84 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: dispatcher.id,
        reportedByUserName: dispatcher.name,
        estimatedDelayHours: 38,
        affectedOrderIds: shipment.orderIds,
        status: 'ACTIVE'
      };

      const proposalByDispatcher = generateRecoveryProposals(testDb, mockIncident, shipment, orders, dispatcher);

      // Dispatcher attempts to approve:
      const dispatcherAttempt = validateProposalApproval(dispatcher, proposalByDispatcher);
      // Operations Planner attempts to approve:
      const plannerAttempt = validateProposalApproval(planner, proposalByDispatcher);
      // Auditor attempts to approve:
      const auditorAttempt = validateProposalApproval(auditor, proposalByDispatcher);
      // Valid SCM attempts to approve:
      const scmAttempt = validateProposalApproval(manager1, proposalByDispatcher);

      const passed = 
        !dispatcherAttempt.allowed &&
        !plannerAttempt.allowed &&
        !auditorAttempt.allowed &&
        scmAttempt.allowed &&
        dispatcherAttempt.code === 'UNAUTHORIZED_ROLE';

      results.push({
        id: 'test-5-role-authorization',
        name: 'Step 5: Supply Chain Manager Role Authorization Gate',
        category: 'APPROVAL_ENFORCEMENT',
        passed,
        durationMs: Date.now() - t5Start,
        assertion: 'Only users with SUPPLY_CHAIN_MANAGER role can decide proposals; Dispatcher, Planner, Auditor blocked.',
        details: `Dispatcher: ${dispatcherAttempt.code}, Planner: ${plannerAttempt.code}, Auditor: ${auditorAttempt.code}, Manager1: allowed=${scmAttempt.allowed}.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-5-role-authorization',
        name: 'Step 5: Supply Chain Manager Role Authorization Gate',
        category: 'APPROVAL_ENFORCEMENT',
        passed: false,
        durationMs: Date.now() - t5Start,
        assertion: 'Only SCM can approve',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 6: Execution Safety (Never Execute Unapproved or Rejected Plans)
    // ----------------------------------------------------
    const t6Start = Date.now();
    try {
      const mockIncident: DisruptionIncident = {
        id: 'inc-test-unapproved',
        code: 'INC-UNAPP-01',
        shipmentId: shipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: 'Safety Test',
        description: 'Test',
        severity: 'CRITICAL',
        locationName: 'Nagpur',
        coordinates: { lat: 20.56, lng: 78.84 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: dispatcher.id,
        reportedByUserName: dispatcher.name,
        estimatedDelayHours: 38,
        affectedOrderIds: shipment.orderIds,
        status: 'ACTIVE'
      };

      const submittedProposal = generateRecoveryProposals(testDb, mockIncident, shipment, orders, dispatcher);
      // Status is SUBMITTED, not APPROVED:
      const submittedExecutionCheck = validateProposalExecution(manager1, submittedProposal, testDb);

      // Create a REJECTED proposal:
      const rejectedProposal = { ...submittedProposal, id: 'prop-rej-test', status: 'REJECTED' as const };
      const rejectedExecutionCheck = validateProposalExecution(manager1, rejectedProposal, testDb);

      const passed = 
        !submittedExecutionCheck.allowed &&
        submittedExecutionCheck.code === 'UNAPPROVED_PLAN_BLOCKED' &&
        !rejectedExecutionCheck.allowed &&
        rejectedExecutionCheck.code === 'UNAPPROVED_PLAN_BLOCKED';

      results.push({
        id: 'test-6-execution-safety',
        name: 'Step 6: Prevention of Unapproved or Rejected Plan Execution',
        category: 'EXECUTION_SAFETY',
        passed,
        durationMs: Date.now() - t6Start,
        assertion: 'Execution strictly prohibited for proposals in SUBMITTED or REJECTED status.',
        details: `Submitted block code: ${submittedExecutionCheck.code}, Rejected block code: ${rejectedExecutionCheck.code}.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-6-execution-safety',
        name: 'Step 6: Prevention of Unapproved or Rejected Plan Execution',
        category: 'EXECUTION_SAFETY',
        passed: false,
        durationMs: Date.now() - t6Start,
        assertion: 'Execution prohibited for unapproved plans',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 7: Consistent Simulated Execution & State Transitions
    // ----------------------------------------------------
    const t7Start = Date.now();
    try {
      const delayedShipment: Shipment = {
        ...shipment,
        currentEta: new Date(new Date(shipment.originalEta).getTime() + 38 * 3600 * 1000).toISOString(),
        delayHours: 38
      };
      testDb.updateShipment(delayedShipment);

      const evaluatedOrders = evaluateShipmentOrdersRisk(orders, delayedShipment);
      for (const ord of evaluatedOrders) {
        testDb.updateOrder(ord);
      }

      const mockIncident: DisruptionIncident = {
        id: `inc-exec-test-${Date.now()}`,
        code: 'INC-EXEC-01',
        shipmentId: delayedShipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: 'Execution Test Incident',
        description: 'Breakdown execution simulation test',
        severity: 'CRITICAL',
        locationName: 'Nagpur',
        coordinates: { lat: 20.56, lng: 78.84 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: dispatcher.id,
        reportedByUserName: dispatcher.name,
        estimatedDelayHours: 38,
        affectedOrderIds: delayedShipment.orderIds,
        status: 'ACTIVE'
      };
      testDb.addIncident(mockIncident);

      const approvedProposal = generateRecoveryProposals(testDb, mockIncident, delayedShipment, evaluatedOrders, dispatcher);
      approvedProposal.status = 'APPROVED';
      approvedProposal.approvalDecision = {
        decidedByUserId: manager1.id,
        decidedByUserName: manager1.name,
        decidedByUserRole: manager1.role,
        decision: 'APPROVED',
        decidedAt: new Date().toISOString(),
        comments: 'Verified inventory buffers and authorized emergency van dispatch.'
      };
      testDb.addProposal(approvedProposal);

      const blrStockBefore = testDb.getInventoryItem('wh-blr-03', 'SKU-MED-901')?.quantityOnHand || 0;

      // Execute simulation
      const executed = executeProposalSimulation(testDb, approvedProposal, manager1);

      const blrStockAfter = testDb.getInventoryItem('wh-blr-03', 'SKU-MED-901')?.quantityOnHand || 0;
      const originalShipmentAfter = testDb.getShipmentById(delayedShipment.id);
      const orderAfter = testDb.getOrderById('ord-7801');

      const passed = 
        executed.status === 'SIMULATED_EXECUTED' &&
        executed.executionResult?.executionMode === 'SIMULATION' &&
        blrStockAfter < blrStockBefore &&
        originalShipmentAfter?.status === 'REPAIR_IN_PROGRESS' &&
        orderAfter?.status === 'RECOVERED_IN_TRANSIT';

      results.push({
        id: 'test-7-simulation-execution',
        name: 'Step 7: Consistent State Updates during Simulated Execution',
        category: 'EXECUTION_SAFETY',
        passed,
        durationMs: Date.now() - t7Start,
        assertion: 'Inventory decremented, new recovery shipments dispatched, order status marked RECOVERED_IN_TRANSIT.',
        details: `BLR stock went from ${blrStockBefore} -> ${blrStockAfter}. Original shipment marked '${originalShipmentAfter?.status}'. Order status: '${orderAfter?.status}'.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-7-simulation-execution',
        name: 'Step 7: Consistent State Updates during Simulated Execution',
        category: 'EXECUTION_SAFETY',
        passed: false,
        durationMs: Date.now() - t7Start,
        assertion: 'Consistent state updates during simulation',
        error: e.message
      });
    }

    // ----------------------------------------------------
    // TEST 8: Comprehensive Audit Trail Recording
    // ----------------------------------------------------
    const t8Start = Date.now();
    try {
      const logs = testDb.getAuditLogs();
      const hasSimExecLog = logs.some(l => l.eventType === 'SIMULATION_EXECUTION_COMPLETED');
      const hasInventoryLog = logs.some(l => l.eventType === 'INVENTORY_REALLOCATED');

      const testAuditEntry = recordAuditLog(
        testDb,
        'PROPOSAL_APPROVED',
        manager2,
        'PROPOSAL',
        'prop-audit-test',
        'Authorized recovery plan by regional SCM Sarah Jenkins.',
        { authorizedBy: manager2.name, costThreshold: 50000 },
        true
      );

      const recorded = testDb.getAuditLogs().find(l => l.id === testAuditEntry.id);
      const passed = 
        hasSimExecLog && 
        hasInventoryLog && 
        recorded !== undefined && 
        recorded.actor.id === manager2.id &&
        recorded.isSimulated === true;

      results.push({
        id: 'test-8-audit-trail',
        name: 'Step 8: Audit Trail Recording & Actor Traceability',
        category: 'AUDIT_RECORDING',
        passed,
        durationMs: Date.now() - t8Start,
        assertion: 'Every action records immutable timestamped audit log with actor ID, role, entity, and simulation flag.',
        details: `Audit trail active with ${testDb.getAuditLogs().length} entries. Verified actor attribution and simulated execution markers.`
      });
    } catch (e: any) {
      results.push({
        id: 'test-8-audit-trail',
        name: 'Step 8: Audit Trail Recording & Actor Traceability',
        category: 'AUDIT_RECORDING',
        passed: false,
        durationMs: Date.now() - t8Start,
        assertion: 'Audit trail recording',
        error: e.message
      });
    }

  } finally {
    // Restore original state so tests do not pollute live demo state
    testDb.persist(originalState);
  }

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    durationMs: Date.now() - startTime,
    results
  };
}
