import React, { useState } from 'react';
import { Order, RiskScoreBreakdown } from '../types/index.ts';
import { AlertCircle, Clock, DollarSign, Building2, HelpCircle, ChevronDown, ChevronUp, CheckCircle, ShieldAlert } from 'lucide-react';

interface OrderRiskCardProps {
  order: Order;
  rank: number;
}

export const OrderRiskCard: React.FC<OrderRiskCardProps> = ({ order, rank }) => {
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);
  const risk = order.riskAssessment;

  const getRiskBadge = (score: number, level: string) => {
    if (score >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <ShieldAlert className="w-3.5 h-3.5" />
          {level} RISK ({score}/100)
        </span>
      );
    }
    if (score >= 50) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <AlertCircle className="w-3.5 h-3.5" />
          {level} RISK ({score}/100)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        <CheckCircle className="w-3.5 h-3.5" />
        {level} RISK ({score}/100)
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AT_RISK_DELAYED':
        return <span className="px-2 py-0.5 text-xs rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">AT RISK (SLA BREACH)</span>;
      case 'RECOVERED_IN_TRANSIT':
        return <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">RECOVERED (ON-SCHEDULE)</span>;
      case 'ON_SCHEDULE':
        return <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">ON SCHEDULE</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded bg-indigo-500/20 text-indigo-300">{status}</span>;
    }
  };

  return (
    <div className={`rounded-xl border transition-all ${
      risk?.isSlaBreached 
        ? 'bg-slate-900 border-rose-900/60 shadow-lg shadow-rose-950/20' 
        : 'bg-slate-900 border-slate-800'
    } p-5 text-slate-200`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-400">
            #{rank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-base text-white">{order.orderNumber}</span>
              {getStatusBadge(order.status)}
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                {order.customerTier.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {order.customerName}
            </div>
            <div className="text-xs text-slate-400">{order.industry} • {order.destinationCity}</div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {risk && getRiskBadge(risk.score, risk.riskLevel)}
          <div className="text-xs text-slate-400 font-mono">
            Value: ₹{order.totalValue.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Primary Order Item and SLA Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 py-3 text-xs">
        <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[11px]">Payload SKU & Quantity</div>
          <div className="font-semibold text-slate-200 mt-0.5 truncate">{order.items[0]?.productName}</div>
          <div className="font-mono text-indigo-300 mt-0.5">{order.items[0]?.quantity} Units ({order.items[0]?.sku})</div>
        </div>

        <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            Committed SLA Deadline
          </div>
          <div className="font-semibold text-slate-200 mt-0.5">
            {new Date(order.committedSla).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} IST
          </div>
          <div className={`text-[11px] font-mono mt-0.5 ${
            risk?.isSlaBreached ? 'text-rose-400 font-semibold' : 'text-emerald-400'
          }`}>
            {risk?.isSlaBreached ? `BREACH BY ${Math.abs(risk.delayMarginHours)}h` : `Buffer: +${risk?.delayMarginHours || 0}h`}
          </div>
        </div>

        <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-rose-400" />
            Contractual Penalty
          </div>
          <div className="font-semibold text-rose-300 mt-0.5">
            ₹{order.dailyPenaltyAmount.toLocaleString('en-IN')} / Day
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Direct legal breach liability</div>
        </div>

        <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
          <div className="text-slate-400 text-[11px]">Downstream Impact</div>
          <div className="font-medium text-slate-300 mt-0.5 line-clamp-2 text-[11px]" title={order.operationalImpact}>
            {order.operationalImpact}
          </div>
        </div>
      </div>

      {/* Deterministic Risk Breakdown Section */}
      {risk && (
        <div className="mt-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>Deterministic Priority Math</span>
              <span className="text-[11px] font-mono text-indigo-400">({risk.score} / 100)</span>
            </span>
            <button
              onClick={() => setShowFormulaDetails(!showFormulaDetails)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>{showFormulaDetails ? 'Hide Component Scoring' : 'View Formula Breakdown'}</span>
              {showFormulaDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Explainability Summary Box */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
            <span className="text-indigo-400 font-semibold mr-1.5">Priority Justification:</span>
            {risk.explanation}
          </div>

          {/* Expandable Mathematical Breakdown */}
          {showFormulaDetails && (
            <div className="mt-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs space-y-2.5">
              <div className="text-slate-400 font-medium text-[11px] uppercase tracking-wider">
                Formula: Risk Score = SLA Deficit (0-40) + Penalty Exposure (0-35) + Downstream Consequence (0-25)
              </div>

              {/* Progress Bar 1 */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">1. SLA Deficit & Buffer Compression</span>
                  <span className="font-mono text-slate-200">{risk.components.slaDeficitScore} / 40 pts</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-rose-500 rounded-full" 
                    style={{ width: `${(risk.components.slaDeficitScore / 40) * 100}%` }}
                  />
                </div>
              </div>

              {/* Progress Bar 2 */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">2. Customer Account Tier & Contractual Penalty Rate</span>
                  <span className="font-mono text-slate-200">{risk.components.customerPenaltyScore} / 35 pts</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full" 
                    style={{ width: `${(risk.components.customerPenaltyScore / 35) * 100}%` }}
                  />
                </div>
              </div>

              {/* Progress Bar 3 */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">3. Downstream Operational Disruption (Line Stoppage / Surgical Risk)</span>
                  <span className="font-mono text-slate-200">{risk.components.downstreamImpactScore} / 25 pts</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full" 
                    style={{ width: `${(risk.components.downstreamImpactScore / 25) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
