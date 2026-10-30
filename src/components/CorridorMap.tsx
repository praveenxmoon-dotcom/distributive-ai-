import React from 'react';
import { Shipment, DisruptionIncident, Warehouse } from '../types/index.ts';
import { AlertTriangle, CheckCircle2, Clock, Truck, Plane, Navigation, ShieldCheck } from 'lucide-react';

interface CorridorMapProps {
  shipment: Shipment | undefined;
  incident: DisruptionIncident | undefined;
  warehouses: Warehouse[];
  recoveryShipments?: Shipment[];
}

export const CorridorMap: React.FC<CorridorMapProps> = ({
  shipment,
  incident,
  warehouses,
  recoveryShipments = []
}) => {
  const isBreakdown = shipment?.status === 'DELAYED_BREAKDOWN' || incident !== undefined;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-base">
            Delhi - Chennai Freight Corridor (NH-44 Spine)
          </h3>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
            2,180 KM Linehaul
          </span>
        </div>

        <div className="flex items-center gap-2">
          {shipment?.status === 'DELAYED_BREAKDOWN' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              Breakdown at KM 742 (Nagpur) (+{shipment.delayHours}h Delay)
            </span>
          )}
          {shipment?.status === 'IN_TRANSIT' && !incident && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Truck className="w-3.5 h-3.5" />
              Nominal In-Transit (On Schedule)
            </span>
          )}
          {shipment?.status === 'REPAIR_IN_PROGRESS' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Clock className="w-3.5 h-3.5" />
              Linehaul Repair in Progress (Offloaded to Recovery Legs)
            </span>
          )}
        </div>
      </div>

      {/* Visual Corridor Diagram */}
      <div className="relative py-4 px-2">
        {/* Progress Line */}
        <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-800 -translate-y-1/2 rounded-full" />
        
        {/* Traveled portion */}
        <div 
          className={`absolute top-1/2 left-8 h-1 -translate-y-1/2 rounded-full transition-all duration-700 ${
            isBreakdown ? 'bg-rose-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${Math.min(100, (742 / 2180) * 100)}%` }}
        />

        <div className="relative grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-center">
          {/* Milestone 1: Delhi Origin */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-indigo-400 flex items-center justify-center text-indigo-300 shadow-md">
              <span className="text-xs font-bold">DEL</span>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-200">Delhi Central DC</div>
            <div className="text-[10px] text-slate-400">Origin (KM 0)</div>
          </div>

          {/* Milestone 2: Agra */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 mt-1 rounded-full bg-slate-800 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-2 text-xs font-medium text-slate-300">Agra Toll</div>
            <div className="text-[10px] text-slate-400">KM 230 - Passed</div>
          </div>

          {/* Milestone 3: Gwalior */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 mt-1 rounded-full bg-slate-800 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-2 text-xs font-medium text-slate-300">Gwalior Bypass</div>
            <div className="text-[10px] text-slate-400">KM 350 - Passed</div>
          </div>

          {/* Milestone 4: Incident Location (Nagpur / Hinganghat) */}
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform ${
              isBreakdown 
                ? 'bg-rose-600 border-2 border-rose-300 text-white scale-110 ring-4 ring-rose-500/20' 
                : 'bg-slate-800 border-2 border-slate-600 text-slate-400'
            }`}>
              {isBreakdown ? <AlertTriangle className="w-5 h-5 animate-bounce" /> : <Clock className="w-4 h-4" />}
            </div>
            <div className={`mt-2 text-xs font-semibold ${isBreakdown ? 'text-rose-400' : 'text-slate-300'}`}>
              Nagpur / Hinganghat
            </div>
            <div className="text-[10px] text-slate-400">
              {isBreakdown ? 'BREAKDOWN (KM 742)' : 'KM 742 In-Transit'}
            </div>
          </div>

          {/* Milestone 5: Hyderabad */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 mt-1 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-500">
              <span className="text-[10px] font-mono">HYD</span>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-400">Hyderabad Hub</div>
            <div className="text-[10px] text-slate-500">KM 1,510 - Downstream</div>
          </div>

          {/* Milestone 6: Chennai Destination */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 shadow-md">
              <span className="text-xs font-bold">MAA</span>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-200">Chennai Fulfillment</div>
            <div className="text-[10px] text-slate-400">Destination (KM 2,180)</div>
          </div>
        </div>
      </div>

      {/* Alternative Reallocation Vectors (Bengaluru -> Chennai) */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/60 flex items-start gap-3">
          <div className="p-2 rounded bg-indigo-500/20 text-indigo-300">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <span>Bengaluru Hub (BLR-DC-03) Rapid Link</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                340 KM (7h Transit)
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Alternative stock warehouse for immediate road expediting to Chennai. Verified stock available for healthcare & automotive SKUs.
            </p>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/60 flex items-start gap-3">
          <div className="p-2 rounded bg-sky-500/20 text-sky-300">
            <Plane className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <span>Air Cargo Corridor (DEL Airport to MAA Airport)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-mono">
                5.5h Lead Time
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Emergency flight cargo option from Delhi IGI Airport for critical payloads if regional hubs are stock-depleted.
            </p>
          </div>
        </div>
      </div>

      {/* Active Simulated Recovery Shipments */}
      {recoveryShipments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            Active Simulated Recovery Dispatches ({recoveryShipments.length}):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recoveryShipments.map(rs => (
              <div key={rs.id} className="bg-emerald-950/40 border border-emerald-500/30 rounded p-2 text-xs flex justify-between items-center">
                <div>
                  <div className="font-mono text-emerald-300 font-semibold">{rs.trackingNumber}</div>
                  <div className="text-[11px] text-slate-300">{rs.carrier} ({rs.vehicleType})</div>
                </div>
                <div className="text-right">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">
                    SIMULATED IN-TRANSIT
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    ETA: {new Date(rs.currentEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
