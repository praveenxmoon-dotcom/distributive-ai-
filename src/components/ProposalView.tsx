import React, { useState } from 'react';
import { RecoveryProposal, RecoveryActionItem, User } from '../types/index.ts';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Truck, 
  Plane, 
  Clock, 
  DollarSign, 
  Warehouse as WarehouseIcon, 
  ArrowRight, 
  Edit3, 
  FileCheck,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

interface ProposalViewProps {
  proposal: RecoveryProposal;
  currentUser: User;
  onModifyAction?: (actionId: string, transportMode: any, carrierName: string, notes: string) => void;
  onOpenApprovalModal: (proposal: RecoveryProposal) => void;
  onExecuteSimulation: (proposal: RecoveryProposal) => void;
  isExecuting?: boolean;
}

export const ProposalView: React.FC<ProposalViewProps> = ({
  proposal,
  currentUser,
  onModifyAction,
  onOpenApprovalModal,
  onExecuteSimulation,
  isExecuting = false
}) => {
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editCarrier, setEditCarrier] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const isProposer = proposal.createdById === currentUser.id;
  const isManager = currentUser.role === 'SUPPLY_CHAIN_MANAGER';
  const canDecide = isManager && !isProposer && proposal.status === 'SUBMITTED';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            AWAITING SCM APPROVAL (Maker-Checker Gate Active)
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            APPROVED (Ready for Simulated Execution)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
            REJECTED BY SCM
          </span>
        );
      case 'SIMULATED_EXECUTED':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            EXECUTED [SIMULATION MODE]
          </span>
        );
      default:
        return <span className="px-2.5 py-1 text-xs rounded bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'ALTERNATE_HUB_REALLOCATION':
        return <Truck className="w-4 h-4 text-emerald-400" />;
      case 'AIR_FREIGHT_EXPEDITE':
        return <Plane className="w-4 h-4 text-sky-400" />;
      case 'SPLIT_ORDER_HYBRID':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleStartEdit = (action: RecoveryActionItem) => {
    setEditingActionId(action.id);
    setEditCarrier(action.carrierName);
    setEditNotes(action.notes);
  };

  const handleSaveEdit = (action: RecoveryActionItem) => {
    if (onModifyAction) {
      onModifyAction(action.id, action.transportMode, editCarrier, editNotes);
    }
    setEditingActionId(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-white">{proposal.title}</h3>
            {getStatusBadge(proposal.status)}
          </div>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            {proposal.description}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
            <span>Author / Proposer: <strong className="text-slate-200">{proposal.createdByName}</strong> ({proposal.createdByRole})</span>
            <span>•</span>
            <span>Created: {new Date(proposal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Cost & Savings Overview */}
        <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs">
          <div className="text-right">
            <div className="text-slate-400 text-[10px] uppercase">Expedited Cost</div>
            <div className="text-amber-400 font-bold text-sm">
              ₹{proposal.totalEstimatedCost.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="h-7 w-px bg-slate-800" />
          <div className="text-right">
            <div className="text-slate-400 text-[10px] uppercase">Penalty Saved</div>
            <div className="text-emerald-400 font-bold text-sm">
              ₹{proposal.totalPenaltySavings.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="h-7 w-px bg-slate-800" />
          <div className="text-right">
            <div className="text-slate-400 text-[10px] uppercase">Net Value</div>
            <div className="text-indigo-300 font-bold text-sm">
              +₹{(proposal.totalPenaltySavings - proposal.totalEstimatedCost).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* Action Items Table / List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <span>Feasible Recovery Actions by Order ({proposal.actions.length} legs)</span>
          <span className="text-slate-400 font-normal lowercase">Actual stock validated against live inventory records</span>
        </div>

        <div className="space-y-3">
          {proposal.actions.map(action => (
            <div 
              key={action.id} 
              className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-slate-800 border border-slate-700">
                    {getStrategyIcon(action.strategy)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{action.orderNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                        {action.strategy.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Transport: <span className="text-slate-200">{action.transportMode.replace(/_/g, ' ')}</span> via <span className="text-slate-200 font-medium">{action.carrierName}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Stock validation badge */}
                  {action.stockValidationStatus === 'VERIFIED_AVAILABLE' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Stock Verified ({action.stockAvailableAtSource} units available at source)
                    </span>
                  )}
                  {action.stockValidationStatus === 'INSUFFICIENT_STOCK' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Insufficient Stock
                    </span>
                  )}
                  {action.stockValidationStatus === 'NOT_APPLICABLE' && (
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">
                      Wait for Repair (No Stock Transfer)
                    </span>
                  )}

                  {proposal.status === 'SUBMITTED' && (
                    <button
                      onClick={() => handleStartEdit(action)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                      title="Modify action leg"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Body: Routing & Cost breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 text-xs">
                {/* Leg Path */}
                <div className="space-y-1">
                  <div className="text-slate-400 text-[11px] flex items-center gap-1">
                    <WarehouseIcon className="w-3 h-3 text-slate-400" />
                    Fulfillment Leg
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                    <span>{action.sourceWarehouseName || 'Original Truck'}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Chennai Hub (MAA-DC-02)</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Recovering: <strong className="text-slate-200">{action.quantityToRecover} Units</strong> of SKU <span className="font-mono text-indigo-300">{action.sku}</span>
                  </div>
                </div>

                {/* Transit & ETA */}
                <div className="space-y-1">
                  <div className="text-slate-400 text-[11px] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Transit Duration & Target Arrival
                  </div>
                  <div className="text-slate-200 font-medium">
                    Lead Time: {action.leadTimeHours} Hours
                  </div>
                  <div className="text-emerald-400 text-[11px] font-mono">
                    New ETA: {new Date(action.newProjectedEta).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} IST
                  </div>
                </div>

                {/* Cost Formula Breakdown */}
                <div className="space-y-1 bg-slate-900/80 p-2 rounded border border-slate-800/80 font-mono text-[11px]">
                  <div className="flex justify-between text-slate-400">
                    <span>Expedited Freight:</span>
                    <span className="text-slate-200">₹{action.costBreakdown.freightCost.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Handling + Surcharge:</span>
                    <span className="text-slate-200">₹{(action.costBreakdown.handlingFee + action.costBreakdown.expeditingSurcharge).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-semibold border-t border-slate-800 pt-1">
                    <span>SLA Penalty Saved:</span>
                    <span>₹{action.costBreakdown.slaPenaltySavings.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-2 text-[11px] text-slate-400 italic">
                {action.notes}
              </div>

              {/* In-place Editing Form if active */}
              {editingActionId === action.id && (
                <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-indigo-500/40 space-y-2">
                  <div className="text-xs font-semibold text-indigo-300">Modify Recovery Action Parameters</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Assigned Carrier</label>
                      <input 
                        type="text" 
                        value={editCarrier} 
                        onChange={(e) => setEditCarrier(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Operational Notes</label>
                      <input 
                        type="text" 
                        value={editNotes} 
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingActionId(null)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(action)}
                      className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                    >
                      Save Modifications
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Decision Summary if already decided */}
      {proposal.approvalDecision && (
        <div className={`p-4 rounded-lg border text-xs ${
          proposal.approvalDecision.decision === 'APPROVED'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
        }`}>
          <div className="font-semibold flex items-center gap-1.5 text-sm mb-1">
            <FileCheck className="w-4 h-4" />
            Supply Chain Manager Decision: {proposal.approvalDecision.decision}
          </div>
          <div>Decided by: <strong>{proposal.approvalDecision.decidedByUserName}</strong> ({proposal.approvalDecision.decidedByUserRole})</div>
          <div>Decision Timestamp: {new Date(proposal.approvalDecision.decidedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
          <div className="mt-1 font-sans italic text-slate-300">"{proposal.approvalDecision.comments}"</div>
        </div>
      )}

      {/* Action Decision & Execution Bar */}
      <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Governance Explanation Banner */}
        <div className="text-xs text-slate-400">
          {proposal.status === 'SUBMITTED' && (
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                Four-Eyes Policy: Proposer (<strong>{proposal.createdByName}</strong>) cannot self-approve. Requires an independent Supply Chain Manager.
              </span>
            </div>
          )}
          {proposal.status === 'APPROVED' && (
            <div className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                Proposal is fully authorized. Ready for simulation execution.
              </span>
            </div>
          )}
          {proposal.status === 'REJECTED' && (
            <div className="flex items-center gap-1.5 text-rose-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                Proposal was rejected. System prohibits execution of rejected plans.
              </span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          {proposal.status === 'SUBMITTED' && (
            <button
              onClick={() => onOpenApprovalModal(proposal)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-md shadow-indigo-600/20"
            >
              <FileCheck className="w-4 h-4" />
              Review & Decide (Approve / Reject)
            </button>
          )}

          {proposal.status === 'APPROVED' && (
            <button
              onClick={() => onExecuteSimulation(proposal)}
              disabled={isExecuting}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-md shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isExecuting ? 'Executing Simulation...' : 'Execute Approved Plan [SIMULATION MODE]'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
