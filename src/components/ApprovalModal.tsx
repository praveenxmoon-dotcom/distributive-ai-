import React, { useState } from 'react';
import { RecoveryProposal, User } from '../types/index.ts';
import { ShieldCheck, ShieldAlert, AlertTriangle, X, CheckCircle, Ban } from 'lucide-react';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: RecoveryProposal | null;
  currentUser: User;
  onDecide: (proposalId: string, decision: 'APPROVED' | 'REJECTED', comments: string) => Promise<void>;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  onClose,
  proposal,
  currentUser,
  onDecide
}) => {
  if (!isOpen || !proposal) return null;

  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isProposer = proposal.createdById === currentUser.id;
  const isModifier = proposal.lastModifiedById === currentUser.id || (proposal.modifierUserIds && proposal.modifierUserIds.includes(currentUser.id));
  const isManager = currentUser.role === 'SUPPLY_CHAIN_MANAGER';

  // Rule 1: Role check
  const roleCheckPassed = isManager;
  // Rule 2: Maker-Checker separation of duties check (neither proposer nor modifier can approve)
  const makerCheckerPassed = !isProposer && !isModifier;

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await onDecide(proposal.id, decision, comments);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Decision failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Supply Chain Manager Governance Review</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-1 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Active Session & Policy Check Box */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
              <span className="text-slate-400">Current Authenticated Reviewer:</span>
              <span className="font-semibold text-slate-200">
                {currentUser.name} ({currentUser.role})
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Check 1: Role */}
              <div className="flex items-center justify-between">
                <span className="text-slate-300">1. SCM Role Authorization Gate</span>
                {roleCheckPassed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Passed (SUPPLY_CHAIN_MANAGER)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                    <Ban className="w-3.5 h-3.5" /> Blocked ({currentUser.role} cannot decide)
                  </span>
                )}
              </div>

              {/* Check 2: Maker-Checker Four-Eyes */}
              <div className="flex items-center justify-between">
                <span className="text-slate-300">2. Maker-Checker Separation of Duties</span>
                {makerCheckerPassed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Passed (Independent from Proposer)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5" /> Policy Breach (Proposer cannot approve own plan)
                  </span>
                )}
              </div>
            </div>

            {/* Explanatory Alert if blocked */}
            {(!roleCheckPassed || !makerCheckerPassed) && (
              <div className="mt-2 p-3 bg-rose-950/60 border border-rose-600/40 rounded-lg text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Server-Enforced Governance Gate Active:</strong>
                  {!roleCheckPassed && (
                    <p className="mt-0.5">
                      You are signed in as <strong>{currentUser.name}</strong> with role <code>{currentUser.role}</code>. Only authenticated <code>SUPPLY_CHAIN_MANAGER</code> users can approve proposals. Switch to Praveen Sharma or Sarah Jenkins to decide.
                    </p>
                  )}
                  {roleCheckPassed && !makerCheckerPassed && (
                    <p className="mt-0.5">
                      You created this recovery proposal. Under supply chain compliance standards, <strong>the proposer cannot approve their own plan</strong>. Switch to <strong>Sarah Jenkins</strong> (Regional SCM) to simulate a dual-authorization review.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Proposal Summary */}
          <div className="text-xs space-y-1 bg-slate-800/30 p-3 rounded-lg border border-slate-800">
            <div className="font-semibold text-slate-200 text-sm">{proposal.title}</div>
            <div className="text-slate-400">Proposer: {proposal.createdByName} • Cost: ₹{proposal.totalEstimatedCost.toLocaleString('en-IN')} • Saved Penalties: ₹{proposal.totalPenaltySavings.toLocaleString('en-IN')}</div>
          </div>

          {/* Manager Comments */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reviewer Approval Notes / Justification:
            </label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="e.g. Verified Bengaluru buffer stock and approved dedicated express van charter to prevent hospital oncology kit stockout."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-900/40 border border-rose-500/50 rounded-lg text-rose-200 text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDecision('REJECTED')}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700/60 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Reject Proposal
            </button>
            <button
              onClick={() => handleDecision('APPROVED')}
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              {submitting ? 'Submitting Decision...' : 'Authorize & Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
