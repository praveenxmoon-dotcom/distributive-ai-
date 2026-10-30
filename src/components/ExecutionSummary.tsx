import React from 'react';
import { RecoveryProposal } from '../types/index.ts';
import { CheckCircle2, Truck, Package, Layers, ShieldCheck, ArrowRight } from 'lucide-react';

interface ExecutionSummaryProps {
  proposal: RecoveryProposal;
  onViewAuditTrail: () => void;
}

export const ExecutionSummary: React.FC<ExecutionSummaryProps> = ({
  proposal,
  onViewAuditTrail
}) => {
  const result = proposal.executionResult;
  if (!result) return null;

  return (
    <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-6 text-slate-100 shadow-xl space-y-5 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Simulated Plan Execution Completed</h3>
              <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                [SIMULATED EXECUTION]
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Target plan: <strong className="text-slate-200">{proposal.title}</strong> • Executed by: {result.executedByUserName} at {new Date(result.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
            </p>
          </div>
        </div>

        <button
          onClick={onViewAuditTrail}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium border border-slate-700 flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Inspect Execution Audit Log
        </button>
      </div>

      {/* Grid of Results: Inventory Adjustments + Recovery Dispatches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inventory Deductions */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Database Inventory Deductions (Real Stock Reallocated)</span>
          </div>

          <div className="space-y-2 text-xs">
            {result.inventoryAdjustments.map((inv, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">{inv.warehouseName}</div>
                  <div className="text-[11px] font-mono text-indigo-300">{inv.sku}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-rose-400 font-mono">
                    -{inv.quantityDeducted} Units Committed
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Remaining unreserved: <strong className="text-emerald-400">{inv.remainingAvailable}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dispatched Rapid Recovery Shipments */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Truck className="w-4 h-4 text-emerald-400" />
            <span>Simulated Expedited Recovery Shipments Dispatched</span>
          </div>

          <div className="space-y-2 text-xs">
            {result.newShipmentsGenerated.map((shp, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="font-mono font-bold text-emerald-300">{shp.shipmentId.toUpperCase()}</div>
                  <div className="text-[11px] text-slate-300">{shp.carrier} ({shp.mode.replace(/_/g, ' ')})</div>
                </div>
                <div className="text-right">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">
                    IN-TRANSIT
                  </span>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    ETA: {new Date(shp.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-400" />
          <span>
            Successfully restored <strong>{result.ordersUpdatedCount} customer orders</strong> to SLA-compliant status with zero estimated contract breach penalty.
          </span>
        </div>
        <div className="font-mono text-emerald-400 text-xs font-bold">
          All changes atomically persisted to disk.
        </div>
      </div>
    </div>
  );
};
