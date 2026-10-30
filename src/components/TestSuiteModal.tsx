import React, { useState } from 'react';
import { TestSuiteSummary } from '../server/testRunner.ts';
import { Play, CheckCircle2, XCircle, Clock, ShieldCheck, X, RefreshCw } from 'lucide-react';

interface TestSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestSuiteModal: React.FC<TestSuiteModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(false);
  const [suiteResult, setSuiteResult] = useState<TestSuiteSummary | null>(null);

  const runTests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-suite/run', { method: 'POST' });
      const data = await res.json();
      setSuiteResult(data);
    } catch (err) {
      console.error('Failed to run test suite:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-white text-base">Automated DisruptionIQ Compliance & Verification Suite</h3>
              <p className="text-xs text-slate-400">Verifies business rules, maker-checker policy, stock validation, and execution safety</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Stats Banner */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={runTests}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-md"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {loading ? 'Executing Test Suite...' : 'Run All 8 Verification Tests'}
            </button>

            {suiteResult && (
              <span className="text-slate-400 font-mono">
                Duration: {suiteResult.durationMs}ms • Ran {suiteResult.total} test cases
              </span>
            )}
          </div>

          {suiteResult && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {suiteResult.passed} Passed
              </span>
              {suiteResult.failed > 0 && (
                <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  {suiteResult.failed} Failed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Test Cases List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          {!suiteResult && !loading && (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <ShieldCheck className="w-10 h-10 text-indigo-400 mx-auto opacity-70" />
              <p className="font-semibold text-slate-200">Test suite ready to run.</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click "Run All 8 Verification Tests" to execute server-side assertions covering approval enforcement, maker-checker separation of duties, stock queries, and execution blocks.
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <RefreshCw className="w-8 h-8 text-indigo-400 mx-auto animate-spin" />
              <p>Executing test suite against live database instances...</p>
            </div>
          )}

          {suiteResult && suiteResult.results.map((test, index) => (
            <div 
              key={test.id} 
              className={`p-3.5 rounded-xl border ${
                test.passed 
                  ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700' 
                  : 'bg-rose-950/40 border-rose-600/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">
                        [{index + 1}/8] {test.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                        {test.category}
                      </span>
                    </div>
                    <div className="text-slate-300 mt-1 font-medium">
                      Assertion: {test.assertion}
                    </div>
                    {test.details && (
                      <div className="text-slate-400 text-[11px] mt-1 font-mono">
                        Result: {test.details}
                      </div>
                    )}
                    {test.error && (
                      <div className="text-rose-300 text-[11px] mt-1 font-mono">
                        Error: {test.error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-slate-500 whitespace-nowrap">
                  {test.durationMs}ms
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>CLI alternative: Run <code>npx tsx test/run-tests.ts</code> in terminal</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
