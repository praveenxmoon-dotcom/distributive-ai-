import React, { useState } from 'react';
import { AuditLogEntry, AuditEventType } from '../types/index.ts';
import { Shield, Filter, Search, ChevronRight, ChevronDown, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface AuditTrailViewerProps {
  logs: AuditLogEntry[];
}

export const AuditTrailViewer: React.FC<AuditTrailViewerProps> = ({ logs }) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => {
    if (filterType !== 'ALL' && log.eventType !== filterType) return false;
    if (searchQuery.trim() === '') return true;
    const q = searchQuery.toLowerCase();
    return (
      log.summary.toLowerCase().includes(q) ||
      log.actor.name.toLowerCase().includes(q) ||
      log.eventType.toLowerCase().includes(q) ||
      log.entityId.toLowerCase().includes(q)
    );
  });

  const getEventBadge = (type: AuditEventType) => {
    switch (type) {
      case 'INCIDENT_CREATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">INCIDENT_CREATED</span>;
      case 'RISK_SCORES_EVALUATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">RISK_SCORES_EVALUATED</span>;
      case 'PROPOSAL_GENERATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">PROPOSAL_GENERATED</span>;
      case 'APPROVAL_BLOCKED_POLICY_VIOLATION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-600/30 text-rose-200 border border-rose-500/50">APPROVAL_BLOCKED (POLICY)</span>;
      case 'PROPOSAL_APPROVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PROPOSAL_APPROVED</span>;
      case 'PROPOSAL_REJECTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">PROPOSAL_REJECTED</span>;
      case 'SIMULATION_EXECUTION_COMPLETED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">SIMULATION_EXECUTED</span>;
      case 'INVENTORY_REALLOCATED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">INVENTORY_REALLOCATED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">{type}</span>;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-white text-base">Immutable Audit Trail & Regulatory Event Log</h3>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            {filteredLogs.length} Records
          </span>
        </div>

        {/* Filter and Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by actor, order, incident..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Event Types</option>
            <option value="INCIDENT_CREATED">Incident Created</option>
            <option value="RISK_SCORES_EVALUATED">Risk Scores Evaluated</option>
            <option value="PROPOSAL_GENERATED">Proposal Generated</option>
            <option value="APPROVAL_BLOCKED_POLICY_VIOLATION">Approval Blocked (Policy)</option>
            <option value="PROPOSAL_APPROVED">Proposal Approved</option>
            <option value="SIMULATION_EXECUTION_COMPLETED">Simulation Executed</option>
            <option value="INVENTORY_REALLOCATED">Inventory Reallocated</option>
          </select>
        </div>
      </div>

      {/* Log Entries List */}
      <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No audit records match the selected filter.
          </div>
        ) : (
          filteredLogs.map(log => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div 
                key={log.id} 
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 text-xs transition-colors"
              >
                <div 
                  className="flex flex-wrap items-start justify-between gap-2 cursor-pointer"
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <button className="text-slate-500 hover:text-slate-300 mt-0.5">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {getEventBadge(log.eventType)}
                        {log.isSimulated && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                            SIMULATED
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST
                        </span>
                      </div>
                      <p className="text-slate-200 mt-1 font-medium leading-relaxed">
                        {log.summary}
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-400">
                    <div>Actor: <strong className="text-slate-300">{log.actor.name}</strong></div>
                    <div className="font-mono text-slate-500">{log.actor.role}</div>
                  </div>
                </div>

                {/* Expanded JSON details */}
                {isExpanded && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                      <span>Log ID: {log.id}</span>
                      <span>Target Entity: {log.entityType} ({log.entityId})</span>
                    </div>
                    <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-48">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
