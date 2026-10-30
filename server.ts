import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db } from './src/server/db.ts';
import { calculateDeterministicRiskScore, evaluateShipmentOrdersRisk } from './src/server/riskEngine.ts';
import { generateRecoveryProposals } from './src/server/recoveryEngine.ts';
import { 
  validateProposalApproval, 
  validateProposalExecution, 
  executeProposalSimulation 
} from './src/server/rulesEngine.ts';
import { recordAuditLog } from './src/server/auditService.ts';
import { runComprehensiveTestSuite } from './src/server/testRunner.ts';
import { DisruptionIncident, Shipment, User, UserRole } from './src/types/index.ts';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Helper to extract actor from request
  const getActorFromRequest = (req: Request): User => {
    const userId = (req.headers['x-user-id'] as string) || req.body?.actorId || req.body?.userId;
    if (userId) {
      const user = db.getUserById(userId);
      if (user) return user;
    }
    // Default fallback to Senior SCM
    return db.getUserById('user-scm-01')!;
  };

  // --------------------------------------------------------------------------
  // API Endpoints
  // --------------------------------------------------------------------------

  // 1. Health & Meta
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'DisruptionIQ - Delivery Delays to Recovery Plans',
      version: '1.0.0-milestone1',
      serverTime: new Date().toISOString(),
      activeIncidents: db.getIncidents().length,
      activeShipments: db.getShipments().length
    });
  });

  // 2. Demo Users & Roles
  app.get('/api/users', (_req: Request, res: Response) => {
    res.json(db.getUsers());
  });

  // 3. Full System State
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(db.getData());
  });

  // 4. Reset Demo State
  app.post('/api/reset', (req: Request, res: Response) => {
    const actor = getActorFromRequest(req);
    const cleanState = db.resetToDefault();
    recordAuditLog(
      db,
      'SYSTEM_DATABASE_RESET',
      actor,
      'SYSTEM',
      'system-reset',
      `Demo state reset to clean baseline by ${actor.name} (${actor.role}).`,
      {},
      true
    );
    res.json({ success: true, message: 'System state reset to initial demo baseline.', data: cleanState });
  });

  // 5. STEP 1 & 2 & 3: Create Truck Breakdown Incident & Evaluate Risks
  app.post('/api/incidents/create-breakdown', (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const targetShipmentId = req.body.shipmentId || 'shp-del-maa-9042';
      const delayHours = req.body.delayHours || 38;
      const customLocation = req.body.locationName || 'Nagpur / Hinganghat Corridor (KM 742 on NH-44)';

      const shipment = db.getShipmentById(targetShipmentId);
      if (!shipment) {
        return res.status(404).json({ error: `Shipment ${targetShipmentId} not found in database.` });
      }

      // Check if incident already active on this shipment
      const existing = db.getIncidents().find(i => i.shipmentId === shipment.id && i.status === 'ACTIVE');
      if (existing) {
        return res.status(409).json({
          error: 'An active breakdown incident is already registered on this shipment.',
          incident: existing
        });
      }

      // 1. Calculate new ETA based on breakdown delay
      const origEtaMs = new Date(shipment.originalEta).getTime();
      const newEta = new Date(origEtaMs + delayHours * 3600 * 1000).toISOString();

      // 2. Create Incident Record
      const incidentCode = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const incident: DisruptionIncident = {
        id: `inc-${Date.now()}`,
        code: incidentCode,
        shipmentId: shipment.id,
        type: 'TRUCK_BREAKDOWN',
        title: `Mechanical Axle & Transmission Failure on Delhi-Chennai Spine Corridor`,
        description: `Vehicle DL-01-AX-9942 suffered catastrophic rear differential axle shear near Hinganghat / Nagpur corridor. Heavy towing and specialized parts transit required from Nagpur depot. Total delay projected at +${delayHours} hours.`,
        severity: 'CRITICAL',
        locationName: customLocation,
        coordinates: { lat: 20.5600, lng: 78.8400 },
        loggedAt: new Date().toISOString(),
        reportedByUserId: actor.id,
        reportedByUserName: actor.name,
        estimatedDelayHours: delayHours,
        affectedOrderIds: [...shipment.orderIds],
        status: 'ACTIVE'
      };

      db.addIncident(incident);

      // 3. Update Shipment State
      shipment.status = 'DELAYED_BREAKDOWN';
      shipment.delayHours = delayHours;
      shipment.currentEta = newEta;
      shipment.incidentId = incident.id;
      // Update milestone status
      shipment.milestones = shipment.milestones.map(m => {
        if (m.locationName.includes('Nagpur') || m.locationName.includes('Hinganghat')) {
          return { ...m, status: 'CURRENT_INCIDENT', actualTimestamp: new Date().toISOString() };
        }
        return m;
      });
      db.updateShipment(shipment);

      // 4. STEP 2 & 3: Identify affected orders and calculate deterministic risk scores
      const allOrders = db.getOrders();
      const affectedOrders = allOrders.filter(o => shipment.orderIds.includes(o.id));
      const evaluatedOrders = evaluateShipmentOrdersRisk(affectedOrders, shipment);

      // Save evaluated orders back to database
      for (const ord of evaluatedOrders) {
        db.updateOrder(ord);
      }

      // 5. STEP 8: Record Audit Logs
      recordAuditLog(
        db,
        'INCIDENT_CREATED',
        actor,
        'INCIDENT',
        incident.id,
        `Breakdown incident ${incident.code} registered for shipment ${shipment.trackingNumber}. Corridor: Delhi to Chennai. Delay: +${delayHours}h. Affected orders: ${affectedOrders.length}.`,
        {
          shipmentId: shipment.id,
          carrier: shipment.carrier,
          vehicle: shipment.vehicleRegistration,
          delayHours,
          newEta,
          affectedOrdersCount: affectedOrders.length
        },
        true
      );

      recordAuditLog(
        db,
        'RISK_SCORES_EVALUATED',
        actor,
        'ORDER',
        incident.id,
        `Evaluated deterministic risk priority for ${evaluatedOrders.length} affected customer orders. Top critical risk: ${evaluatedOrders[0]?.orderNumber} (${evaluatedOrders[0]?.customerName}) score ${evaluatedOrders[0]?.riskAssessment?.score}/100.`,
        {
          orderScores: evaluatedOrders.map(o => ({
            orderNumber: o.orderNumber,
            score: o.riskAssessment?.score,
            riskLevel: o.riskAssessment?.riskLevel,
            isSlaBreached: o.riskAssessment?.isSlaBreached
          }))
        },
        true
      );

      res.status(201).json({
        incident,
        shipment,
        affectedOrders: evaluatedOrders,
        summary: `Incident ${incident.code} created successfully. Identified ${affectedOrders.length} affected orders with deterministic risk scoring.`
      });
    } catch (err: any) {
      console.error('[INCIDENT_CREATE_ERROR]', err);
      res.status(500).json({ error: err.message || 'Failed to create incident.' });
    }
  });

  // 6. STEP 4: Generate Feasible Recovery Proposals with Stock Validation
  app.post('/api/proposals/generate', (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const incidentId = req.body.incidentId;
      const planType = req.body.planType || 'OPTIMAL_BALANCED';

      let incident = db.getIncidentById(incidentId);
      if (!incident) {
        const activeIncidents = db.getIncidents().filter(i => i.status === 'ACTIVE');
        if (activeIncidents.length > 0) {
          incident = activeIncidents[0];
        } else {
          return res.status(404).json({ error: 'No active incident found to generate proposals for. Trigger a breakdown incident first.' });
        }
      }

      const shipment = db.getShipmentById(incident.shipmentId);
      if (!shipment) {
        return res.status(404).json({ error: `Shipment ${incident.shipmentId} not found.` });
      }

      const orders = db.getOrders().filter(o => incident.affectedOrderIds.includes(o.id));

      // Generate proposal using real stock & cost algorithms
      const proposal = generateRecoveryProposals(db, incident, shipment, orders, actor, planType);
      db.addProposal(proposal);

      // Record Audit Log
      recordAuditLog(
        db,
        'PROPOSAL_GENERATED',
        actor,
        'PROPOSAL',
        proposal.id,
        `Generated recovery plan '${proposal.title}' with ${proposal.actions.length} action legs. Total estimated cost: ₹${proposal.totalEstimatedCost.toLocaleString('en-IN')}, Penalty savings: ₹${proposal.totalPenaltySavings.toLocaleString('en-IN')}.`,
        {
          proposalId: proposal.id,
          planType,
          totalCost: proposal.totalEstimatedCost,
          penaltySavings: proposal.totalPenaltySavings,
          actionsCount: proposal.actions.length,
          recoveredOrders: proposal.ordersFullyRecoveredCount
        },
        true
      );

      res.status(201).json({
        proposal,
        message: 'Recovery proposal generated with real multi-hub stock verification.'
      });
    } catch (err: any) {
      console.error('[PROPOSAL_GENERATE_ERROR]', err);
      res.status(500).json({ error: err.message || 'Failed to generate proposal.' });
    }
  });

  // 7. STEP 5: Modify Proposal
  app.put('/api/proposals/:id/modify', (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const proposalId = req.params.id;
      const { actionId, transportMode, carrierName, notes } = req.body;

      const proposal = db.getProposalById(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }

      if (proposal.status === 'APPROVED' || proposal.status === 'SIMULATED_EXECUTED') {
        return res.status(400).json({ error: `Cannot modify a proposal that is already ${proposal.status}.` });
      }

      const action = proposal.actions.find(a => a.id === actionId);
      if (!action) {
        return res.status(404).json({ error: 'Action item not found in proposal.' });
      }

      if (transportMode) action.transportMode = transportMode;
      if (carrierName) action.carrierName = carrierName;
      if (notes) action.notes = notes;
      proposal.updatedAt = new Date().toISOString();

      db.updateProposal(proposal);

      recordAuditLog(
        db,
        'PROPOSAL_MODIFIED',
        actor,
        'PROPOSAL',
        proposal.id,
        `Proposal '${proposal.title}' modified by ${actor.name} (${actor.role}). Action leg ${action.orderNumber} updated.`,
        { actionId, transportMode, carrierName, notes },
        true
      );

      res.json({ proposal, message: 'Proposal modified successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. STEP 5 & 6: Require Authenticated Supply Chain Manager to Approve or Reject (Enforce Maker-Checker)
  app.post('/api/proposals/:id/decide', (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const proposalId = req.params.id;
      const { decision, comments } = req.body; // 'APPROVED' | 'REJECTED'

      if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
        return res.status(400).json({ error: "Invalid decision. Must be 'APPROVED' or 'REJECTED'." });
      }

      const proposal = db.getProposalById(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: `Proposal ${proposalId} not found.` });
      }

      // ENFORCE BUSINESS RULES:
      const ruleCheck = validateProposalApproval(actor, proposal);
      if (!ruleCheck.allowed) {
        // Record policy violation audit entry
        recordAuditLog(
          db,
          'APPROVAL_BLOCKED_POLICY_VIOLATION',
          actor,
          'PROPOSAL',
          proposal.id,
          `Blocked ${decision} attempt on proposal '${proposal.title}' by ${actor.name} (${actor.role}): ${ruleCheck.message}`,
          {
            actorId: actor.id,
            actorRole: actor.role,
            proposerId: proposal.createdById,
            errorCode: ruleCheck.code
          },
          true
        );

        return res.status(403).json({
          error: ruleCheck.message,
          code: ruleCheck.code,
          proposer: proposal.createdByName,
          actor: actor.name,
          actorRole: actor.role
        });
      }

      // Passed business rules! Apply decision:
      proposal.status = decision;
      proposal.updatedAt = new Date().toISOString();
      proposal.approvalDecision = {
        decidedByUserId: actor.id,
        decidedByUserName: actor.name,
        decidedByUserRole: actor.role,
        decision,
        decidedAt: new Date().toISOString(),
        comments: comments || (decision === 'APPROVED' ? 'Approved for simulated execution.' : 'Plan rejected.')
      };

      db.updateProposal(proposal);

      const eventType = decision === 'APPROVED' ? 'PROPOSAL_APPROVED' : 'PROPOSAL_REJECTED';
      recordAuditLog(
        db,
        eventType,
        actor,
        'PROPOSAL',
        proposal.id,
        `Recovery plan '${proposal.title}' ${decision} by ${actor.name} (${actor.title}). Comments: "${proposal.approvalDecision.comments}"`,
        {
          decision,
          comments: proposal.approvalDecision.comments,
          totalCost: proposal.totalEstimatedCost,
          penaltySavings: proposal.totalPenaltySavings
        },
        true
      );

      res.json({
        proposal,
        message: `Proposal successfully marked ${decision} by authorized Supply Chain Manager.`
      });
    } catch (err: any) {
      console.error('[DECIDE_PROPOSAL_ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. STEP 6 & 7: Execute ONLY an APPROVED Plan in Simulation Mode
  app.post('/api/proposals/:id/execute', (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const proposalId = req.params.id;

      const proposal = db.getProposalById(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: `Proposal ${proposalId} not found.` });
      }

      // ENFORCE BUSINESS RULES:
      const ruleCheck = validateProposalExecution(actor, proposal, db);
      if (!ruleCheck.allowed) {
        return res.status(409).json({
          error: ruleCheck.message,
          code: ruleCheck.code,
          currentStatus: proposal.status
        });
      }

      // Execute simulation
      const executedProposal = executeProposalSimulation(db, proposal, actor);

      res.json({
        proposal: executedProposal,
        message: 'Plan executed successfully in simulation mode. Demo shipments, orders, and inventory updated consistently.'
      });
    } catch (err: any) {
      console.error('[EXECUTE_PROPOSAL_ERROR]', err);
      res.status(400).json({ error: err.message });
    }
  });

  // 10. Audit Trail
  app.get('/api/audit-trail', (_req: Request, res: Response) => {
    res.json(db.getAuditLogs());
  });

  // 11. Automated Test Suite Runner Endpoint
  app.post('/api/test-suite/run', (_req: Request, res: Response) => {
    try {
      const summary = runComprehensiveTestSuite();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Test suite execution failed.' });
    }
  });

  // --------------------------------------------------------------------------
  // Vite Integration (React SPA Frontend)
  // --------------------------------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('Production build directory "dist" not found. Falling back to dev mode if needed.');
    }
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[DisruptionIQ] Full-Stack Server active on http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('[DisruptionIQ] Server startup failure:', err);
  process.exit(1);
});
