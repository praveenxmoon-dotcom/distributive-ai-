import React, { useState, useEffect } from 'react';
import { 
  User, 
  Warehouse, 
  InventoryItem, 
  Shipment, 
  Order, 
  DisruptionIncident, 
  RecoveryProposal, 
  AuditLogEntry 
} from './types/index.ts';
import { CorridorMap } from './components/CorridorMap.tsx';
import { OrderRiskCard } from './components/OrderRiskCard.tsx';
import { ProposalView } from './components/ProposalView.tsx';
import { ApprovalModal } from './components/ApprovalModal.tsx';
import { ExecutionSummary } from './components/ExecutionSummary.tsx';
import { AuditTrailViewer } from './components/AuditTrailViewer.tsx';
import { TestSuiteModal } from './components/TestSuiteModal.tsx';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Layers, 
  ShieldCheck, 
  RotateCcw, 
  Play, 
  FileText, 
  Users, 
  ArrowRight,
  TrendingDown,
  Warehouse as WarehouseIcon,
  Sparkles,
  Info
} from 'lucide-react';

export default function App() {
  // State
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventories, setInventories] = useState<InventoryItem[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [incidents, setIncidents] = useState<DisruptionIncident[]>([]);
  const [proposals, setProposals] = useState<RecoveryProposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<'CONSOLE' | 'INVENTORY' | 'AUDIT' | 'COMPLIANCE'>('CONSOLE');
  const [selectedPlanType, setSelectedPlanType] = useState<'OPTIMAL_BALANCED' | 'MAX_SPEED_EXPEDITE' | 'CONSERVATIVE_SPLIT'>('OPTIMAL_BALANCED');
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [selectedProposalForApproval, setSelectedProposalForApproval] = useState<RecoveryProposal | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isCreatingIncident, setIsCreatingIncident] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Load state on mount
  useEffect(() => {
    fetchState();
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      setUsers(data.users || []);
      if (!currentUser && data.users && data.users.length > 0) {
        // Default to Praveen (Senior SCM)
        setCurrentUser(data.users[0]);
      }
      setWarehouses(data.warehouses || []);
      setInventories(data.inventories || []);
      setShipments(data.shipments || []);
      setOrders(data.orders || []);
      setIncidents(data.incidents || []);
      setProposals(data.proposals || []);
      setAuditLogs(data.auditLogs || []);
    } catch (err) {
      console.error('Error fetching state:', err);
    }
  };

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // STEP 1: Create Breakdown Incident
  const handleTriggerBreakdown = async () => {
    if (!currentUser) return;
    setIsCreatingIncident(true);
    try {
      const res = await fetch('/api/incidents/create-breakdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          shipmentId: 'shp-del-maa-9042',
          delayHours: 38
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Failed to create incident');
      } else {
        showNotification('success', data.summary || 'Breakdown incident logged successfully!');
        await fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsCreatingIncident(false);
    }
  };

  // STEP 4: Generate Recovery Proposal
  const handleGenerateProposal = async () => {
    if (!currentUser) return;
    setIsGeneratingProposal(true);
    try {
      const activeIncident = incidents.find(i => i.status === 'ACTIVE') || incidents[0];
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          incidentId: activeIncident?.id,
          planType: selectedPlanType
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Failed to generate proposal');
      } else {
        showNotification('success', 'Recovery proposal generated with multi-hub stock verification.');
        await fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  // STEP 5: Modify Proposal Action
  const handleModifyProposalAction = async (actionId: string, transportMode: any, carrierName: string, notes: string) => {
    if (!latestProposal || !currentUser) return;
    try {
      const res = await fetch(`/api/proposals/${latestProposal.id}/modify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ actionId, transportMode, carrierName, notes })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Modification failed.');
      } else {
        showNotification('success', 'Proposal action modified and recorded in audit log.');
        await fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // STEP 5 & 6: Decide (Approve / Reject) Proposal
  const handleDecideProposal = async (proposalId: string, decision: 'APPROVED' | 'REJECTED', comments: string) => {
    if (!currentUser) return;
    const res = await fetch(`/api/proposals/${proposalId}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({ decision, comments })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit decision.');
    }
    showNotification('success', data.message || `Proposal ${decision} successfully.`);
    await fetchState();
  };

  // STEP 7: Execute Simulation
  const handleExecuteSimulation = async (proposal: RecoveryProposal) => {
    if (!currentUser) return;
    setIsExecuting(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Execution blocked by server.');
      } else {
        showNotification('success', data.message || 'Simulation executed successfully.');
        await fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset Demo State
  const handleResetDemo = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('info', 'Demo state reset to clean baseline (SHP-DEL-MAA-9042 in nominal transit).');
        await fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Active shipment and incident
  const primaryShipment = shipments.find(s => s.id === 'shp-del-maa-9042') || shipments[0];
  const activeIncident = incidents.find(i => i.status === 'ACTIVE' || i.status === 'RESOLVING') || incidents[0];
  const affectedOrders = orders.filter(o => primaryShipment?.orderIds.includes(o.id));
  const latestProposal = proposals[0];
  const recoveryShipments = shipments.filter(s => s.id !== 'shp-del-maa-9042');

  // Determine active workflow step
  let currentWorkflowStep = 1;
  if (activeIncident) currentWorkflowStep = 2;
  if (affectedOrders.some(o => o.riskAssessment)) currentWorkflowStep = 3;
  if (latestProposal) currentWorkflowStep = 4;
  if (latestProposal && latestProposal.status !== 'SUBMITTED') currentWorkflowStep = 5;
  if (latestProposal && latestProposal.status === 'SIMULATED_EXECUTED') currentWorkflowStep = 7;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ---------------- Top Navbar & Role Switcher ---------------- */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20">
              IQ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">DisruptionIQ</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-medium border border-indigo-500/30">
                  MILESTONE 1 (END-TO-END)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                From Delivery Delays to Recovery Plans • Deterministic Supply Chain Resolution
              </p>
            </div>
          </div>

          {/* User Session Switcher & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Authenticated User Selector */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <Users className="w-4 h-4 text-indigo-400" />
              <div className="text-xs">
                <span className="text-slate-400 text-[11px] block">Active Persona / Role:</span>
                <select
                  value={currentUser?.id || ''}
                  onChange={(e) => {
                    const found = users.find(u => u.id === e.target.value);
                    if (found) setCurrentUser(found);
                  }}
                  className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100">
                      {u.name} — {u.role === 'SUPPLY_CHAIN_MANAGER' ? 'SCM (Approver)' : `${u.role} (Proposer)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Test Runner Modal Trigger */}
            <button
              onClick={() => setIsTestModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-xs font-semibold border border-indigo-700/60 flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Compliance Tests (8/8)</span>
            </button>

            {/* Reset Demo Button */}
            <button
              onClick={handleResetDemo}
              title="Reset state to initial clean baseline"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 animate-in slide-in-from-top-2 duration-200">
          <div className={`p-3.5 rounded-xl text-xs font-medium shadow-2xl flex items-center gap-2.5 max-w-md ${
            notification.type === 'error'
              ? 'bg-rose-950 border border-rose-600 text-rose-200'
              : notification.type === 'success'
                ? 'bg-emerald-950 border border-emerald-600 text-emerald-200'
                : 'bg-indigo-950 border border-indigo-600 text-indigo-200'
          }`}>
            {notification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* ---------------- Workflow Stepper Banner ---------------- */}
      <section className="bg-slate-900/60 border-b border-slate-800/80 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>End-to-End Workflow Milestone Progression:</span>
            </span>

            {/* Stepper bubbles */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                activeIncident 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                  : 'bg-indigo-600 text-white animate-pulse'
              }`}>
                <span>1. Breakdown Incident</span>
                {activeIncident && <CheckCircle2 className="w-3.5 h-3.5" />}
              </span>

              <ArrowRight className="w-3 h-3 text-slate-600" />

              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                affectedOrders.some(o => o.riskAssessment)
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <span>2 & 3. Deterministic Risk Scoring</span>
                {affectedOrders.some(o => o.riskAssessment) && <CheckCircle2 className="w-3.5 h-3.5" />}
              </span>

              <ArrowRight className="w-3 h-3 text-slate-600" />

              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                latestProposal
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <span>4. Recovery Synthesis</span>
                {latestProposal && <CheckCircle2 className="w-3.5 h-3.5" />}
              </span>

              <ArrowRight className="w-3 h-3 text-slate-600" />

              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                latestProposal?.status === 'APPROVED' || latestProposal?.status === 'SIMULATED_EXECUTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : latestProposal?.status === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                <span>5 & 6. SCM Four-Eyes Gate</span>
                {(latestProposal?.status === 'APPROVED' || latestProposal?.status === 'SIMULATED_EXECUTED') && <CheckCircle2 className="w-3.5 h-3.5" />}
              </span>

              <ArrowRight className="w-3 h-3 text-slate-600" />

              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                latestProposal?.status === 'SIMULATED_EXECUTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <span>7. Simulated Execution</span>
                {latestProposal?.status === 'SIMULATED_EXECUTED' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </span>

              <ArrowRight className="w-3 h-3 text-slate-600" />

              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <span>8. Audit Trail</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Navigation Tabs ---------------- */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto flex space-x-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab('CONSOLE')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'CONSOLE'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Disruption & Recovery Console</span>
          </button>

          <button
            onClick={() => setActiveTab('INVENTORY')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'INVENTORY'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Multi-Hub Inventory Matrix ({inventories.length} SKUs)</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'AUDIT'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail & Provenance ({auditLogs.length} Events)</span>
          </button>

          <button
            onClick={() => setActiveTab('COMPLIANCE')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'COMPLIANCE'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Governance Rules & Verification</span>
          </button>
        </div>
      </div>

      {/* ---------------- Main Content Body ---------------- */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-6">
        {activeTab === 'CONSOLE' && (
          <div className="space-y-6">
            {/* Top Corridor Map */}
            <CorridorMap
              shipment={primaryShipment}
              incident={activeIncident}
              warehouses={warehouses}
              recoveryShipments={recoveryShipments}
            />

            {/* STEP 1: Incident Creation / Breakdown Trigger Section */}
            {!activeIncident ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
                      1
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Step 1: Create Truck Breakdown Incident (Delhi to Chennai)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    Shipment <strong>{primaryShipment?.trackingNumber}</strong> is currently in nominal transit along NH-44 carrying 4 customer orders (Apollo Hospitals, Hyundai Motors, SunTech Energy, Croma Retail). Trigger a mechanical breakdown near Nagpur to initiate risk evaluation and recovery planning.
                  </p>
                </div>

                <button
                  onClick={handleTriggerBreakdown}
                  disabled={isCreatingIncident}
                  className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 whitespace-nowrap transition-transform active:scale-95"
                >
                  <AlertTriangle className="w-4 h-4" />
                  {isCreatingIncident ? 'Registering Incident...' : 'Trigger Truck Breakdown (+38h Delay)'}
                </button>
              </div>
            ) : (
              <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-5 text-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">{activeIncident.title}</h4>
                      <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-semibold">
                        {activeIncident.code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-3xl">
                      {activeIncident.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                      <span>Location: <strong className="text-slate-200">{activeIncident.locationName}</strong></span>
                      <span>•</span>
                      <span>Projected Delay: <strong className="text-rose-400">+{activeIncident.estimatedDelayHours} Hours</strong></span>
                      <span>•</span>
                      <span>Affected Orders Identified: <strong className="text-slate-200">{activeIncident.affectedOrderIds.length}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    INCIDENT ACTIVE
                  </span>
                </div>
              </div>
            )}

            {/* STEP 2 & 3: Affected Orders & Deterministic Risk Scoring */}
            {activeIncident && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
                        2 & 3
                      </span>
                      <h3 className="text-base font-bold text-white">
                        Affected Orders & Deterministic Risk Scores
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Deterministic mathematical ranking based on SLA breach margin, contractual daily penalty liability, and downstream operational halt risk.
                    </p>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    Sorted by Risk Score Descending
                  </div>
                </div>

                {/* List of Affected Orders */}
                <div className="grid grid-cols-1 gap-4">
                  {affectedOrders.map((order, idx) => (
                    <OrderRiskCard key={order.id} order={order} rank={idx + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* STEP 4: Generate Recovery Proposal Section */}
            {activeIncident && !latestProposal && (
              <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-6 text-slate-100 shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
                    4
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Step 4: Generate Feasible Recovery Proposal
                  </h3>
                </div>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  DisruptionIQ queries live inventory records across the 4 network hubs (Delhi, Bengaluru, Chennai, Mumbai) and applies real transport cost tables to synthesize actionable recovery proposals with verified stock availability.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <button
                    onClick={() => setSelectedPlanType('OPTIMAL_BALANCED')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      selectedPlanType === 'OPTIMAL_BALANCED'
                        ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-indigo-300 flex items-center justify-between">
                      <span>Optimal Multi-Hub Reallocation</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Reallocates stock from Bengaluru Regional Hub (BLR-DC-03, 340 km away) via dedicated express van. Saves ₹155,000+ in penalties with lowest freight cost.
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedPlanType('MAX_SPEED_EXPEDITE')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      selectedPlanType === 'MAX_SPEED_EXPEDITE'
                        ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-sky-300">
                      Emergency Air Cargo Direct
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Direct air cargo dispatch from Delhi Indira Gandhi Airport to Chennai MAA Airport (5.5h lead time). Maximum speed for high-value cargo.
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedPlanType('CONSERVATIVE_SPLIT')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      selectedPlanType === 'CONSERVATIVE_SPLIT'
                        ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-purple-300">
                      Conservative Split & Buffer Plan
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Splits batch quantities: fast-tracks critical buffer lots via road express; allows non-critical orders (Croma Retail) to continue on repaired truck.
                    </p>
                  </button>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleGenerateProposal}
                    disabled={isGeneratingProposal}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isGeneratingProposal ? 'Synthesizing Proposal...' : 'Generate Feasible Recovery Plan'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4, 5, 6: Active Proposal View */}
            {latestProposal && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
                    4, 5, 6
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Recovery Plan & Governance Review Gate
                  </h3>
                </div>

                <ProposalView
                  proposal={latestProposal}
                  currentUser={currentUser || users[0]}
                  onModifyAction={handleModifyProposalAction}
                  onOpenApprovalModal={(p) => {
                    setSelectedProposalForApproval(p);
                    setIsApprovalModalOpen(true);
                  }}
                  onExecuteSimulation={handleExecuteSimulation}
                  isExecuting={isExecuting}
                />
              </div>
            )}

            {/* STEP 7: Simulated Execution Results */}
            {latestProposal && latestProposal.status === 'SIMULATED_EXECUTED' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center justify-center">
                    7
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Step 7: Consistent State Updates from Simulated Execution
                  </h3>
                </div>

                <ExecutionSummary
                  proposal={latestProposal}
                  onViewAuditTrail={() => setActiveTab('AUDIT')}
                />
              </div>
            )}
          </div>
        )}

        {/* ---------------- Tab 2: Inventory Multi-Hub Matrix ---------------- */}
        {activeTab === 'INVENTORY' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">Multi-Hub Demo Inventory Records</h3>
                <p className="text-xs text-slate-400">
                  Live database inventory for Delhi, Bengaluru, Chennai, and Mumbai nodes. Stock availability is verified in real-time.
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Formula: Available = Quantity On Hand - Reserved
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                    <th className="py-2.5 px-3">Warehouse Hub</th>
                    <th className="py-2.5 px-3">SKU & Product</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">On Hand</th>
                    <th className="py-2.5 px-3 text-right">Reserved</th>
                    <th className="py-2.5 px-3 text-right">Available</th>
                    <th className="py-2.5 px-3 text-right">Unit Value</th>
                    <th className="py-2.5 px-3">Storage Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {inventories.map((item) => {
                    const wh = warehouses.find(w => w.id === item.warehouseId);
                    const isAvailableZero = (item.quantityOnHand - item.reservedQuantity) === 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                          {wh?.name || item.warehouseId} ({wh?.code})
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-200 font-sans font-semibold">{item.productName}</div>
                          <div className="text-indigo-400 text-[11px]">{item.sku}</div>
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-400">
                          {item.category}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 font-bold">
                          {item.quantityOnHand}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-400">
                          {item.reservedQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            isAvailableZero 
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            {item.quantityOnHand - item.reservedQuantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          ₹{item.unitCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-400">
                          {item.storageCondition}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- Tab 3: Audit Trail ---------------- */}
        {activeTab === 'AUDIT' && (
          <AuditTrailViewer logs={auditLogs} />
        )}

        {/* ---------------- Tab 4: Compliance & Governance Rules ---------------- */}
        {activeTab === 'COMPLIANCE' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-white text-base">Server-Side Business Rules & Governance Specifications</h3>
                </div>
                <button
                  onClick={() => setIsTestModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Live Compliance Test Suite (8 Tests)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>Rule 1: Supply Chain Manager Role Authorization</span>
                  </div>
                  <p className="text-slate-300">
                    Proposals can only be approved or rejected by an authenticated user holding the <code>SUPPLY_CHAIN_MANAGER</code> role. Attempts by Dispatchers, Planners, or Auditors are rejected server-side with HTTP 403 Forbidden.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Rule 2: Maker-Checker Separation of Duties (Four-Eyes Principle)</span>
                  </div>
                  <p className="text-slate-300">
                    The proposal author (<code>proposal.createdById</code>) is strictly prohibited from approving their own recovery plan. Even if the author is a Supply Chain Manager, an independent second manager must review and authorize.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Rule 3: Unapproved / Rejected Plan Execution Prevention</span>
                  </div>
                  <p className="text-slate-300">
                    Proposals in <code>DRAFT</code>, <code>SUBMITTED</code>, or <code>REJECTED</code> status cannot be executed. The server immediately blocks execution with HTTP 409 Conflict.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Rule 4: Live Inventory Validation & Atomic Execution</span>
                  </div>
                  <p className="text-slate-300">
                    Simulated execution checks actual database stock (<code>quantityOnHand - reservedQuantity</code>). Deductions and expedited dispatch records are committed atomically.
                  </p>
                </div>
              </div>
            </div>

            {/* Test Runner Embedded View */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">Automated Test Execution</h4>
                  <p className="text-xs text-slate-400">Run the compliance suite covering the exact requirements from Milestone 1</p>
                </div>
                <button
                  onClick={() => setIsTestModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md"
                >
                  Open Test Suite Runner
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ---------------- SCM Approval Modal ---------------- */}
      <ApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        proposal={selectedProposalForApproval}
        currentUser={currentUser || users[0]}
        onDecide={handleDecideProposal}
      />

      {/* ---------------- Compliance Test Suite Modal ---------------- */}
      <TestSuiteModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />
    </div>
  );
}
