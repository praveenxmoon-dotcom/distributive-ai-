import { Order, Shipment, RiskScoreBreakdown, OrderPriority } from '../types/index.ts';

export function calculateDeterministicRiskScore(order: Order, shipment: Shipment): RiskScoreBreakdown {
  const committedTime = new Date(order.committedSla).getTime();
  const projectedArrival = new Date(shipment.currentEta).getTime();
  const delayMarginHours = Math.round(((committedTime - projectedArrival) / (1000 * 60 * 60)) * 10) / 10;
  const isSlaBreached = delayMarginHours < 0;

  // 1. SLA Deficit Score (0 - 40 points)
  let slaDeficitScore = 0;
  if (isSlaBreached) {
    const breachHours = Math.abs(delayMarginHours);
    slaDeficitScore = Math.min(40, Math.round(20 + breachHours * 1.2));
  } else if (delayMarginHours <= 8) {
    slaDeficitScore = Math.round(18 - delayMarginHours * 1.5);
  } else if (delayMarginHours <= 24) {
    slaDeficitScore = Math.round(10 - (delayMarginHours - 8) * 0.4);
  } else {
    slaDeficitScore = Math.max(2, Math.round(5 - delayMarginHours * 0.05));
  }

  // 2. Customer Tier & Penalty Exposure (0 - 35 points)
  let tierBase = 5;
  if (order.customerTier === 'TIER_1_STRATEGIC') tierBase = 20;
  else if (order.customerTier === 'TIER_2_ENTERPRISE') tierBase = 12;

  // Contractual penalty factor (e.g. ₹120,000/day -> ~15 pts, ₹35,000/day -> ~7 pts)
  const penaltyPts = Math.min(15, Math.round((order.dailyPenaltyAmount / 120000) * 15));
  const customerPenaltyScore = Math.min(35, tierBase + penaltyPts);

  // 3. Downstream Impact Severity (0 - 25 points)
  let downstreamImpactScore = 5;
  if (order.priorityTier === 'CRITICAL' || order.operationalImpact.includes('CATASTROPHIC') || order.operationalImpact.includes('CRITICAL')) {
    downstreamImpactScore = 25;
  } else if (order.priorityTier === 'HIGH' || order.operationalImpact.includes('MODERATE')) {
    downstreamImpactScore = 15;
  } else {
    downstreamImpactScore = 5;
  }

  const rawTotal = slaDeficitScore + customerPenaltyScore + downstreamImpactScore;
  const score = Math.min(100, Math.max(0, rawTotal));

  let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (score >= 80) riskLevel = 'CRITICAL';
  else if (score >= 50) riskLevel = 'HIGH';
  else if (score >= 25) riskLevel = 'MEDIUM';

  // Construct precise, deterministic explanation
  const breachDetail = isSlaBreached 
    ? `SLA BREACH OF ${Math.abs(delayMarginHours)} HOURS (Committed: ${new Date(order.committedSla).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST vs Projected Arrival: ${new Date(shipment.currentEta).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST).`
    : `SLA buffer remaining: ${delayMarginHours}h.`;

  const tierDetail = `${order.customerTier} account (${order.customerName}) with contractual breach penalty of ₹${order.dailyPenaltyAmount.toLocaleString('en-IN')}/day.`;
  const impactDetail = `Operational disruption consequence: ${order.operationalImpact}`;

  const explanation = `Priority Score ${score}/100 [${riskLevel} RISK]: ${breachDetail} ${tierDetail} ${impactDetail} (Score breakdown: SLA Deficit ${slaDeficitScore}/40, Penalty Exposure ${customerPenaltyScore}/35, Downstream Consequence ${downstreamImpactScore}/25).`;

  return {
    orderId: order.id,
    score,
    riskLevel,
    delayMarginHours,
    isSlaBreached,
    components: {
      slaDeficitScore,
      customerPenaltyScore,
      downstreamImpactScore
    },
    explanation,
    evaluatedAt: new Date().toISOString()
  };
}

export function evaluateShipmentOrdersRisk(orders: Order[], shipment: Shipment): Order[] {
  return orders.map(order => {
    const risk = calculateDeterministicRiskScore(order, shipment);
    const updatedOrder: Order = {
      ...order,
      estimatedDelivery: shipment.currentEta,
      status: risk.isSlaBreached ? 'AT_RISK_DELAYED' : order.status,
      riskAssessment: risk
    };
    return updatedOrder;
  }).sort((a, b) => (b.riskAssessment?.score ?? 0) - (a.riskAssessment?.score ?? 0));
}
