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
  executeProposalSimulation,
  applyProposalModification
} from './src/server/rulesEngine.ts';
import { recordAuditLog } from './src/server/auditService.ts';
import { 
  initDemoSessions, 
  createSession, 
  invalidateSession, 
  requireAuth, 
  requireRole, 
  getStandardTokenForUser 
} from './src/server/authService.ts';
import { runComprehensiveTestSuite } from './src/server/testRunner.ts';
import { DisruptionIncident, Shipment, User, UserRole } from './src/types/index.ts';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize standard demo sessions for all seed users
  initDemoSessions();

  // --------------------------------------------------------------------------
  // Authentication & Demo Session Endpoints
  // --------------------------------------------------------------------------

  // Public: List available demo accounts for the persona selector / login
  app.get('/api/auth/demo-users', (_req: Request, res: Response) => {
    const users = db.getUsers().map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      department: u.department,
      avatarUrl: u.avatarUrl,
      standardToken: getStandardTokenForUser(u.id)
    }));
    res.json(users);
  });

  // Public: Authenticate demo user and issue a validated session token
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId in login request.' });
      return;
    }

    const user = db.getUserById(userId);
    if (!user) {
      res.status(404).json({ error: `User with ID '${userId}' not found.` });
      return;
    }

    const session = createSession(user);

    recordAuditLog(
      db,
      'AUTH_LOGIN',
      user,
      'AUTH',
      user.id,
      `User '${user.name}' (${user.role}) authenticated via demo session login.`,
      { userId: user.id, role: user.role, sessionCreated: session.createdAt },
      false
    );

    res.json({
      success: true,
      token: session.token,
      user: session.user,
      expiresAt: session.expiresAt
    });
  });

  // Protected: Validate session and return active user profile
  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    res.json({ user: req.user });
  });

  // Protected: Logout and revoke session token
  app.post('/api/auth/logout', requireAuth, (req: Request, res: Response) => {
    if (req.sessionToken) {
      invalidateSession(req.sessionToken);
    }
    res.json({ success: true, message: 'Session logged out successfully.' });
  });

  // --------------------------------------------------------------------------
  // Public Health Endpoint
  // --------------------------------------------------------------------------
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'DisruptionIQ - Delivery Delays to Recovery Plans',
      version: '1.1.0-milestone1-hardened',
      serverTime: new Date().toISOString(),
      activeIncidents: db.getIncidents().length,
      activeShipments: db.getShipments().length,
      companyWarehousesCount: db.getWarehouses().length
    });
  });

  // --------------------------------------------------------------------------
  // Protected State & User Endpoints
  // --------------------------------------------------------------------------

  // Protected: List registered demo users
  app.get('/api/users', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getUsers());
  });

  // Protected: Retrieve entire current system state
  app.get('/api/state', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getData());
  });

  // Protected & Restricted: Reset demo state (STRICTLY restricted to ADMINISTRATOR role)
  app.post('/api/reset', requireAuth, requireRole('ADMINISTRATOR'), (req: Request, res: Response) => {
    try {
      const actor = req.user!;
      const cleanState = db.resetToDefault(actor);
      res.json({
        success: true,
        message: 'System state reset to initial 2-warehouse demo baseline by Administrator.',
        data: cleanState
      });
    } catch (err: any) {
      console.error('[RESET_ERROR]', err);
      res.status(500).json({ error: err.message || 'Failed to reset demo state.' });
    }
  });

  // --------------------------------------------------------------------------
  // Step 1, 2, 3: Create Incident & Evaluate Deterministic Risks
  // Protected: Requires Dispatcher, Planner, SCM, or Administrator
  // --------------------------------------------------------------------------
  app.post(
    '/api/incidents/create-breakdown',
    requireAuth,
    requireRole('DISPATCHER', 'OPERATIONS_PLANNER', 'SUPPLY_CHAIN_MANAGER', 'ADMINISTRATOR'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user!;
        const targetShipmentId = req.body.shipmentId || 'shp-del-maa-9042';
        const delayHours = req.body.delayHours || 38;
        const customLocation = req.body.locationName || 'Nagpur / Hinganghat Highway Transit Waypoint (KM 742 on NH-44)';

        const shipment = db.getShipmentById(targetShipmentId);
        if (!shipment) {
          res.status(404).json({ error: `Shipment ${targetShipmentId} not found in database.` });
          return;
        }

        // Check if incident already active on this shipment
        const existing = db.getIncidents().find(i => i.shipmentId === shipment.id && i.status === 'ACTIVE');
        if (existing) {
          res.status(409).json({
            error: 'An active breakdown incident is already registered on this shipment.',
            incident: existing
          });
          return;
        }

        // 1. Calculate new ETA
        const origEtaMs = new Date(shipment.originalEta).getTime();
        const newEta = new Date(origEtaMs + delayHours * 3600 * 1000).toISOString();

        // 2. Create Incident Record
        const incidentCode = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const incident: DisruptionIncident = {
          id: `inc-${Date.now()}`,
          code: incidentCode,
          shipmentId: shipment.id,
          type: 'TRUCK_BREAKDOWN',
          title: 'Mechanical Axle Differential Failure on Delhi-Chennai Spine Corridor',
          description: `Vehicle DL-01-AX-9942 suffered rear axle differential fracture near Hinganghat / Nagpur highway transit waypoint (KM 742 on NH-44). Specialized crane towing and parts required from central depot. Projected delay: +${delayHours} hours.`,
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
        shipment.milestones = shipment.milestones.map(m => {
          if (m.locationName.includes('Nagpur') || m.locationName.includes('Hinganghat')) {
            return { ...m, status: 'CURRENT_INCIDENT', actualTimestamp: new Date().toISOString() };
          }
          return m;
        });
        db.updateShipment(shipment);

        // 4. Identify affected orders and calculate deterministic risk scores
        const allOrders = db.getOrders();
        const affectedOrders = allOrders.filter(o => shipment.orderIds.includes(o.id));
        const evaluatedOrders = evaluateShipmentOrdersRisk(affectedOrders, shipment);

        for (const ord of evaluatedOrders) {
          db.updateOrder(ord);
        }

        // 5. Record Audit Logs
        recordAuditLog(
          db,
          'INCIDENT_CREATED',
          actor,
          'INCIDENT',
          incident.id,
          `Breakdown incident ${incident.code} registered for shipment ${shipment.trackingNumber} by ${actor.name} (${actor.role}). Corridor: Delhi to Chennai. Delay: +${delayHours}h. Affected orders: ${affectedOrders.length}.`,
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
    }
  );

  // --------------------------------------------------------------------------
  // Step 4: Generate Recovery Proposal
  // Protected: Requires Dispatcher, Planner, SCM, or Administrator
  // --------------------------------------------------------------------------
  app.post(
    '/api/proposals/generate',
    requireAuth,
    requireRole('DISPATCHER', 'OPERATIONS_PLANNER', 'SUPPLY_CHAIN_MANAGER', 'ADMINISTRATOR'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user!;
        const incidentId = req.body.incidentId;
        const planType = req.body.planType || 'OPTIMAL_BALANCED';

        let incident = db.getIncidentById(incidentId);
        if (!incident) {
          const activeIncidents = db.getIncidents().filter(i => i.status === 'ACTIVE');
          if (activeIncidents.length > 0) {
            incident = activeIncidents[0];
          } else {
            res.status(404).json({ error: 'No active incident found to generate proposals for. Trigger a breakdown incident first.' });
            return;
          }
        }

        const shipment = db.getShipmentById(incident.shipmentId);
        if (!shipment) {
          res.status(404).json({ error: `Shipment ${incident.shipmentId} not found.` });
          return;
        }

        const orders = db.getOrders().filter(o => incident.affectedOrderIds.includes(o.id));

        // Generate proposal strictly within Delhi/Chennai/Transit cross-dock/External supplier constraints
        const proposal = generateRecoveryProposals(db, incident, shipment, orders, actor, planType);
        db.addProposal(proposal);

        recordAuditLog(
          db,
          'PROPOSAL_GENERATED',
          actor,
          'PROPOSAL',
          proposal.id,
          `Generated recovery plan '${proposal.title}' (v1) with ${proposal.actions.length} action legs by ${actor.name} (${actor.role}). Total cost: ₹${proposal.totalEstimatedCost.toLocaleString('en-IN')}, Penalty savings: ₹${proposal.totalPenaltySavings.toLocaleString('en-IN')}.`,
          {
            proposalId: proposal.id,
            version: proposal.version,
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
          message: 'Recovery proposal generated with real two-warehouse stock verification and transit cross-dock modeling.'
        });
      } catch (err: any) {
        console.error('[PROPOSAL_GENERATE_ERROR]', err);
        res.status(500).json({ error: err.message || 'Failed to generate proposal.' });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Step 5: Modify Proposal (Material modification increments version & invalidates prior approval)
  // Protected: Requires valid authentication
  // --------------------------------------------------------------------------
  app.put('/api/proposals/:id/modify', requireAuth, (req: Request, res: Response) => {
    try {
      const actor = req.user!;
      const proposalId = req.params.id;
      const { actionId, transportMode, carrierName, notes, quantityToRecover } = req.body;

      const proposal = db.getProposalById(proposalId);
      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found.' });
        return;
      }

      const updated = applyProposalModification(db, proposal, actor, actionId, {
        transportMode,
        carrierName,
        notes,
        quantityToRecover
      });

      res.json({
        proposal: updated,
        message: `Proposal modified to v${updated.version}. ${updated.approvalDecision ? '' : 'Prior approvals invalidated; re-approval required.'}`
      });
    } catch (err: any) {
      console.error('[PROPOSAL_MODIFY_ERROR]', err);
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // Step 5 & 6: SCM Decision Gate (Enforces Maker-Checker Four-Eyes Principle)
  // Protected: Strictly requires SUPPLY_CHAIN_MANAGER role
  // --------------------------------------------------------------------------
  app.post(
    '/api/proposals/:id/decide',
    requireAuth,
    requireRole('SUPPLY_CHAIN_MANAGER'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user!;
        const proposalId = req.params.id;
        const { decision, comments } = req.body;

        if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
          res.status(400).json({ error: "Invalid decision. Must be 'APPROVED' or 'REJECTED'." });
          return;
        }

        const proposal = db.getProposalById(proposalId);
        if (!proposal) {
          res.status(404).json({ error: `Proposal ${proposalId} not found.` });
          return;
        }

        // ENFORCE BUSINESS RULES:
        const ruleCheck = validateProposalApproval(actor, proposal);
        if (!ruleCheck.allowed) {
          recordAuditLog(
            db,
            'APPROVAL_BLOCKED_POLICY_VIOLATION',
            actor,
            'PROPOSAL',
            proposal.id,
            `Blocked ${decision} attempt on proposal '${proposal.title}' (v${proposal.version}) by ${actor.name} (${actor.role}): ${ruleCheck.message}`,
            {
              actorId: actor.id,
              actorRole: actor.role,
              proposerId: proposal.createdById,
              modifierIds: proposal.modifierUserIds,
              errorCode: ruleCheck.code
            },
            true
          );

          res.status(403).json({
            error: ruleCheck.message,
            code: ruleCheck.code,
            proposer: proposal.createdByName,
            actor: actor.name,
            actorRole: actor.role
          });
          return;
        }

        // Apply decision and stamp exact approved version
        proposal.status = decision;
        proposal.updatedAt = new Date().toISOString();
        proposal.approvalDecision = {
          decidedByUserId: actor.id,
          decidedByUserName: actor.name,
          decidedByUserRole: actor.role,
          decision,
          approvedVersion: proposal.version,
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
          `Recovery plan '${proposal.title}' (v${proposal.version}) ${decision} by Supply Chain Manager ${actor.name}. Comments: "${proposal.approvalDecision.comments}"`,
          {
            decision,
            approvedVersion: proposal.version,
            comments: proposal.approvalDecision.comments,
            totalCost: proposal.totalEstimatedCost,
            penaltySavings: proposal.totalPenaltySavings
          },
          true
        );

        res.json({
          proposal,
          message: `Proposal v${proposal.version} successfully marked ${decision} by authorized Supply Chain Manager.`
        });
      } catch (err: any) {
        console.error('[DECIDE_PROPOSAL_ERROR]', err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Step 6 & 7: Execute ONLY an Approved Plan in Simulation Mode
  // Protected: Requires SUPPLY_CHAIN_MANAGER or ADMINISTRATOR
  // --------------------------------------------------------------------------
  app.post(
    '/api/proposals/:id/execute',
    requireAuth,
    requireRole('SUPPLY_CHAIN_MANAGER', 'ADMINISTRATOR'),
    (req: Request, res: Response) => {
      try {
        const actor = req.user!;
        const proposalId = req.params.id;

        const proposal = db.getProposalById(proposalId);
        if (!proposal) {
          res.status(404).json({ error: `Proposal ${proposalId} not found.` });
          return;
        }

        // Enforce execution rules: approved state, exact version, stock check, duplicate execution block
        const ruleCheck = validateProposalExecution(actor, proposal, db);
        if (!ruleCheck.allowed) {
          recordAuditLog(
            db,
            'EXECUTION_BLOCKED_POLICY_VIOLATION',
            actor,
            'PROPOSAL',
            proposal.id,
            `Blocked execution attempt on proposal '${proposal.title}': ${ruleCheck.message}`,
            { error: ruleCheck },
            true
          );

          res.status(409).json({
            error: ruleCheck.message,
            code: ruleCheck.code,
            currentStatus: proposal.status
          });
          return;
        }

        // Execute in simulation mode
        const executedProposal = executeProposalSimulation(db, proposal, actor);

        res.json({
          proposal: executedProposal,
          message: 'Plan executed successfully in simulation mode. Shipment, order, and inventory states updated consistently.'
        });
      } catch (err: any) {
        console.error('[EXECUTE_PROPOSAL_ERROR]', err);
        res.status(400).json({ error: err.message });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Step 8: Audit Trail (Protected)
  // --------------------------------------------------------------------------
  app.get('/api/audit-trail', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getAuditLogs());
  });

  // --------------------------------------------------------------------------
  // Automated Test Suite Runner Endpoint
  // Protected: Requires valid authentication
  // --------------------------------------------------------------------------
  app.post('/api/test-suite/run', requireAuth, (_req: Request, res: Response) => {
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
    console.log(`[DisruptionIQ] Hardened Full-Stack Server active on http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('[DisruptionIQ] Server startup failure:', err);
  process.exit(1);
});
