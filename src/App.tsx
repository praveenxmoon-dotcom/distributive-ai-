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
  Lock,
  KeyRound,
  Info
} from 'lucide-react';

export default function App() {
  // Authentication & State
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');
  
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

  // Authenticated fetch helper
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (sessionToken) {
      headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return fetch(url, { ...options, headers });
  };

  // Initial load: fetch demo users and log in as default user
  useEffect(() => {
    initAuthAndState();
  }, []);

  const initAuthAndState = async () => {
    try {
      // 1. Get demo users list
      const res = await fetch('/api/auth/demo-users');
      const demoUsers = await res.json();
      setUsers(demoUsers);

      // Check saved session or default to Praveen Sharma (SCM)
      const savedUserId = localStorage.getItem('disruptioniq_user_id') || 'user-scm-01';
      const targetUser = demoUsers.find((u: any) => u.id === savedUserId) || demoUsers[0];

      if (targetUser) {
        await loginAsUser(targetUser.id, demoUsers);
      }
    } catch (err) {
      console.error('Failed to init auth:', err);
    }
  };

  const loginAsUser = async (userId: string, userList?: User[]) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setSessionToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('disruptioniq_user_id', data.user.id);
        localStorage.setItem('disruptioniq_token', data.token);

        // Fetch state with newly obtained token
        await fetchStateWithToken(data.token);
        showNotification('info', `Signed in as ${data.user.name} (${data.user.role}) with verified session token.`);
      } else {
        showNotification('error', data.error || 'Authentication failed');
      }
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  const fetchStateWithToken = async (token: string) => {
    try {
      const res = await fetch('/api/state', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          showNotification('error', 'Session expired. Please switch persona to re-authenticate.');
        }
        return;
      }
      const data = await res.json();
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

  const fetchState = () => {
    if (sessionToken) fetchStateWithToken(sessionToken);
  };

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // STEP 1: Create Breakdown Incident
  const handleTriggerBreakdown = async () => {
    if (!currentUser || !sessionToken) return;
    setIsCreatingIncident(true);
    try {
      const res = await authFetch('/api/incidents/create-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsCreatingIncident(false);
    }
  };

  // STEP 4: Generate Recovery Proposal
  const handleGenerateProposal = async () => {
    if (!currentUser || !sessionToken) return;
    setIsGeneratingProposal(true);
    try {
      const activeIncident = incidents.find(i => i.status === 'ACTIVE') || incidents[0];
      const res = await authFetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: activeIncident?.id,
          planType: selectedPlanType
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Failed to generate proposal');
      } else {
        showNotification('success', 'Recovery proposal generated with 2-warehouse stock and transit cross-dock modeling.');
        fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  // STEP 5: Modify Proposal Action (triggers material modification and invalidates prior approvals)
  const handleModifyProposalAction = async (actionId: string, transportMode: any, carrierName: string, notes: string, quantityToRecover?: number) => {
    if (!latestProposal || !currentUser || !sessionToken) return;
    try {
      const res = await authFetch(`/api/proposals/${latestProposal.id}/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, transportMode, carrierName, notes, quantityToRecover })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Modification failed.');
      } else {
        showNotification('success', data.message || 'Proposal modified.');
        fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // STEP 5 & 6: SCM Decision Gate (Approve / Reject)
  const handleDecideProposal = async (proposalId: string, decision: 'APPROVED' | 'REJECTED', comments: string) => {
    if (!currentUser || !sessionToken) return;
    const res = await authFetch(`/api/proposals/${proposalId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comments })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit decision.');
    }
    showNotification('success', data.message || `Proposal ${decision} successfully.`);
    fetchState();
  };

  // STEP 7: Execute Simulation
  const handleExecuteSimulation = async (proposal: RecoveryProposal) => {
    if (!currentUser || !sessionToken) return;
    setIsExecuting(true);
    try {
      const res = await authFetch(`/api/proposals/${proposal.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Execution blocked by server.');
      } else {
        showNotification('success', data.message || 'Simulation executed successfully.');
        fetchState();
      }
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset Demo State (Restricted to Administrator role)
  const handleResetDemo = async () => {
    if (!currentUser || !sessionToken) return;

    if (currentUser.role !== 'ADMINISTRATOR') {
      showNotification(
        'error',
        `Access Denied: Demo state reset is strictly restricted to the Administrator role. You are signed in as '${currentUser.name}' (${currentUser.role}). Switch to Devika Roy (Administrator) to reset.`
      );
      return;
    }

    try {
      const res = await authFetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('info', 'Demo state reset to clean 2-warehouse baseline by Administrator.');
        fetchState();
      } else {
        showNotification('error', data.error || 'Reset failed.');
      }
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Active shipment and incident
  const primaryShipment = shipments.find(s => s.id === 'shp-del-maa-9042') || shipments[0];
  const activeIncident = incidents.find(i => i.status === 'ACTIVE' || i.status === 'RESOLVING') || incidents[0];
  const affectedOrders = orders.filter(o => primaryShipment?.orderIds.includes(o.id));
  const latestProposal = proposals[0];
  const recoveryShipments = shipments.filter(s => s.id !== 'shp-del-maa-9042');

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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium border border-emerald-500/30">
                  MILESTONE 1 (HARDENED)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  2 Warehouses: Delhi & Chennai
                </span>
              </div>
              <p className="text-xs text-slate-400">
                From Delivery Delays to Recovery Plans • Verified Authentication & Two-Warehouse Governance
              </p>
            </div>
          </div>

          {/* User Session Switcher & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Authenticated Persona Switcher */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <div className="text-xs">
                <span className="text-slate-400 text-[11px] block">Authenticated Persona:</span>
                <select
                  value={currentUser?.id || ''}
                  onChange={(e) => loginAsUser(e.target.value)}
                  className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100">
                      {u.name} — {u.role === 'ADMINISTRATOR' ? 'ADMIN' : u.role === 'SUPPLY_CHAIN_MANAGER' ? 'SCM (Approver)' : `${u.role}`}
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
              <span>Compliance Tests (10/10)</span>
            </button>

            {/* Reset Demo Button (Admin only) */}
            <button
              onClick={handleResetDemo}
              title={currentUser?.role === 'ADMINISTRATOR' ? 'Reset demo state to baseline' : 'Demo reset is restricted to Administrator role (Devika Roy)'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                currentUser?.role === 'ADMINISTRATOR'
                  ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo {currentUser?.role !== 'ADMINISTRATOR' ? '(Admin Only)' : ''}</span>
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
              <span>Two-Warehouse Disruption Resolution Stepper:</span>
            </span>

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
                <span>4. Recovery Synthesis (v{latestProposal?.version || 1})</span>
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
            <span>2-Warehouse Inventory Matrix ({inventories.length} SKUs)</span>
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
            <span>Governance Rules & Security Limitations</span>
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
                      Step 1: Create Truck Breakdown Incident (Delhi to Chennai Corridor)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    Shipment <strong>{primaryShipment?.trackingNumber}</strong> is travelling between our two demo warehouses, <strong>Delhi Central DC</strong> and <strong>Chennai Fulfillment Hub</strong>. Trigger an axle breakdown near Nagpur highway transit waypoint to initiate deterministic risk scoring and recovery planning.
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
                      <span>Transit Waypoint: <strong className="text-slate-200">{activeIncident.locationName}</strong></span>
                      <span>•</span>
                      <span>Projected Delay: <strong className="text-rose-400">+{activeIncident.estimatedDelayHours} Hours</strong></span>
                      <span>•</span>
                      <span>Affected Orders: <strong className="text-slate-200">{activeIncident.affectedOrderIds.length}</strong></span>
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
                      Deterministic mathematical scoring based on SLA breach margin, contractual daily breach penalty, and downstream operational halt risk.
                    </p>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    Ranked by Priority Score Descending
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
                    Step 4: Generate Feasible Recovery Proposal (Strict 2-Warehouse Constraints)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  DisruptionIQ synthesizes feasible recovery legs using only the two demo warehouses (Delhi Central DC and Chennai), highway relief cross-docking at Nagpur transit waypoint, and contractually verified external partner capacity.
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
                      <span>Optimal Multi-Modal Plan</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Air freight from Delhi Central DC for oncology reagents, highway relief hauler cross-dock at Nagpur (KM 742) for automotive ECMs, and external partner in Chennai for solar boards.
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
                      Emergency Delhi Air Cargo Expedite
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Direct air cargo dispatch from Delhi Central DC (DEL-DC-01) via Indira Gandhi Airport to Chennai Airport (6.5h lead time). Maximum recovery speed using Delhi company stock.
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
                      Conservative Split & Transit Plan
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Fast-tracks urgent buffer lots via Air Cargo from Delhi DC to protect line stoppage; remainder proceeds via highway relief truck cross-docked at Nagpur.
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
                    Recovery Plan Review & Governance Gate (v{latestProposal.version})
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

        {/* ---------------- Tab 2: Inventory 2-Warehouse Matrix ---------------- */}
        {activeTab === 'INVENTORY' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">Two-Warehouse Demo Inventory Records</h3>
                <p className="text-xs text-slate-400">
                  Authoritative inventory strictly for Delhi Central DC (`wh-del-01`) and Chennai Fulfillment Hub (`wh-maa-02`).
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
                  <h3 className="font-bold text-white text-base">Server-Side Business Rules & Security Architecture</h3>
                </div>
                <button
                  onClick={() => setIsTestModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Live Compliance Suite (10 Tests)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4" />
                    <span>Rule 1: Server-Validated Authentication & Role Gates</span>
                  </div>
                  <p className="text-slate-300">
                    All sensitive endpoints require a server-issued Bearer token. Unauthenticated requests and forged tokens are rejected with HTTP 401. User impersonation via headers or request bodies is strictly forbidden.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Rule 2: Maker-Checker Policy (Proposer & Modifier Blocked)</span>
                  </div>
                  <p className="text-slate-300">
                    Neither the proposal creator (<code>createdById</code>) nor any user who made material modifications (<code>modifierUserIds</code>) can approve their own proposal. An independent Supply Chain Manager is mandatory.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Rule 3: Material Modifications Invalidate Approval</span>
                  </div>
                  <p className="text-slate-300">
                    Any modification to a proposal increments its version (e.g. v1 to v2) and immediately revokes any prior approval, reverting its status to <code>SUBMITTED</code> for re-review. Execution requires approval of the exact current version.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <WarehouseIcon className="w-4 h-4 text-emerald-400" />
                    <span>Rule 4: Two-Warehouse Network Integrity</span>
                  </div>
                  <p className="text-slate-300">
                    The company network contains exactly two warehouses: Delhi (DEL-DC-01) and Chennai (MAA-DC-02). All alternative legs utilize transit cross-docks (Nagpur KM 742) or verified external suppliers, never invented company warehouses.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-rose-400" />
                    <span>Rule 5: Administrator-Restricted Demo Reset</span>
                  </div>
                  <p className="text-slate-300">
                    Only users holding the <code>ADMINISTRATOR</code> role (Devika Roy) can execute a demo state reset. Attempts by Supply Chain Managers or Dispatchers are blocked with HTTP 403.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span>Rule 6: Immediate Stock Re-Validation & Negative Inventory Check</span>
                  </div>
                  <p className="text-slate-300">
                    Prior to execution, stock is verified in real-time. Execution is aborted if available units are insufficient or if deduction would produce negative inventory. Duplicate execution is strictly blocked.
                  </p>
                </div>
              </div>

              {/* Documentation of Demo-Only Security Limitations */}
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-amber-500/30 text-xs space-y-2">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4" />
                  <span>Documented Demo-Only Security Limitations (Milestone 1 Prototype)</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px]">
                  <li>
                    <strong>In-Memory Session Store:</strong> Demo authentication generates server-tracked tokens mapped to memory. Server restart regenerates active demo sessions rather than persisting them to an enterprise identity provider (IdP).
                  </li>
                  <li>
                    <strong>Single-Factor Demo Login:</strong> Authentication for hackathon evaluation uses persona credential selection rather than multi-factor enterprise SSO or hardware FIDO2 keys.
                  </li>
                  <li>
                    <strong>Local Disk Persistence:</strong> Data is persisted to an atomic JSON file on the local instance disk rather than an enterprise distributed Cloud SQL / PostgreSQL cluster with row-level security (RLS).
                  </li>
                </ul>
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
        sessionToken={sessionToken}
      />
    </div>
  );
}
