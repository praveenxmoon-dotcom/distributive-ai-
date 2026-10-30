export type UserRole = 'SUPPLY_CHAIN_MANAGER' | 'DISPATCHER' | 'OPERATIONS_PLANNER' | 'AUDITOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  department: string;
  avatarUrl?: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  type: 'CENTRAL_DC' | 'REGIONAL_HUB' | 'FULFILLMENT_CENTER';
  coordinates: { lat: number; lng: number };
  operatingHours: string;
  handlingFeePerUnit: number;
}

export interface InventoryItem {
  id: string;
  warehouseId: string;
  sku: string;
  productName: string;
  category: 'Cold-Chain Pharma' | 'Automotive Spares' | 'Renewable Energy' | 'Consumer Electronics';
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number; // quantityOnHand - reservedQuantity
  unitCost: number;
  weightKg: number;
  storageCondition: 'Ambient' | '2-8°C Cold Chain' | 'Controlled Climate';
}

export type ShipmentStatus = 
  | 'SCHEDULED' 
  | 'IN_TRANSIT' 
  | 'DELAYED_BREAKDOWN' 
  | 'REPAIR_IN_PROGRESS' 
  | 'RECOVERED_SPLIT' 
  | 'DELIVERED';

export interface Milestone {
  id: string;
  locationName: string;
  coordinates: { lat: number; lng: number };
  status: 'COMPLETED' | 'CURRENT_INCIDENT' | 'PENDING';
  plannedTimestamp: string;
  actualTimestamp?: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  carrier: string;
  vehicleType: string;
  vehicleRegistration: string;
  driverName: string;
  driverPhone: string;
  routeCorridor: string;
  totalDistanceKm: number;
  distanceTraveledKm: number;
  status: ShipmentStatus;
  departureTime: string;
  originalEta: string;
  currentEta: string;
  delayHours: number;
  incidentId?: string;
  milestones: Milestone[];
  orderIds: string[];
}

export type OrderPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'STANDARD';
export type CustomerTier = 'TIER_1_STRATEGIC' | 'TIER_2_ENTERPRISE' | 'TIER_3_STANDARD';

export interface OrderItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderRecoveryStatus = 
  | 'ON_SCHEDULE' 
  | 'AT_RISK_DELAYED' 
  | 'RECOVERY_PROPOSED' 
  | 'RECOVERY_APPROVED' 
  | 'RECOVERED_IN_TRANSIT' 
  | 'DELIVERED';

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerTier: CustomerTier;
  industry: string;
  destinationCity: string;
  shipmentId: string;
  items: OrderItem[];
  totalValue: number;
  committedSla: string; // ISO string
  estimatedDelivery: string; // Current projected delivery
  status: OrderRecoveryStatus;
  dailyPenaltyAmount: number; // Contractual penalty
  operationalImpact: string; // e.g. "Hospital Diagnostic Surgery Cancellation Risk"
  priorityTier: OrderPriority;
  riskAssessment?: RiskScoreBreakdown;
}

export interface RiskScoreBreakdown {
  orderId: string;
  score: number; // 0 to 100
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  delayMarginHours: number; // (committedSla - currentEta) in hours. Negative means breach
  isSlaBreached: boolean;
  components: {
    slaDeficitScore: number; // 0-40 pts
    customerPenaltyScore: number; // 0-35 pts
    downstreamImpactScore: number; // 0-25 pts
  };
  explanation: string;
  evaluatedAt: string;
}

export type IncidentSeverity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR';

export interface DisruptionIncident {
  id: string;
  code: string;
  shipmentId: string;
  type: 'TRUCK_BREAKDOWN' | 'ACCIDENT' | 'WEATHER_CLOSURE' | 'MECHANICAL_AXLE_FAILURE';
  title: string;
  description: string;
  severity: IncidentSeverity;
  locationName: string;
  coordinates: { lat: number; lng: number };
  loggedAt: string;
  reportedByUserId: string;
  reportedByUserName: string;
  estimatedDelayHours: number;
  affectedOrderIds: string[];
  status: 'ACTIVE' | 'RESOLVING' | 'RECOVERED' | 'CLOSED';
}

export type RecoveryStrategyType = 
  | 'ALTERNATE_HUB_REALLOCATION' 
  | 'AIR_FREIGHT_EXPEDITE' 
  | 'SPLIT_ORDER_HYBRID' 
  | 'WAIT_ORIGINAL_REPAIR';

export interface RecoveryActionItem {
  id: string;
  orderId: string;
  orderNumber: string;
  strategy: RecoveryStrategyType;
  sku: string;
  quantityToRecover: number;
  sourceWarehouseId?: string;
  sourceWarehouseName?: string;
  targetWarehouseId: string;
  transportMode: 'DEDICATED_EXPRESS_VAN' | 'AIR_CARGO' | 'ORIGINAL_TRUCK' | 'INTERMODAL';
  carrierName: string;
  leadTimeHours: number;
  newProjectedEta: string;
  slaPreserved: boolean;
  stockValidationStatus: 'VERIFIED_AVAILABLE' | 'INSUFFICIENT_STOCK' | 'NOT_APPLICABLE';
  stockOnHandAtSource?: number;
  stockAvailableAtSource?: number;
  costBreakdown: {
    freightCost: number;
    expeditingSurcharge: number;
    handlingFee: number;
    slaPenaltySavings: number;
    netCost: number;
  };
  notes: string;
}

export type ProposalStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'SIMULATED_EXECUTED';

export interface RecoveryProposal {
  id: string;
  incidentId: string;
  title: string;
  description: string;
  status: ProposalStatus;
  createdById: string;
  createdByName: string;
  createdByRole: UserRole;
  createdAt: string;
  updatedAt: string;
  totalEstimatedCost: number;
  totalPenaltySavings: number;
  ordersFullyRecoveredCount: number;
  ordersAtRiskCount: number;
  actions: RecoveryActionItem[];
  approvalDecision?: {
    decidedByUserId: string;
    decidedByUserName: string;
    decidedByUserRole: UserRole;
    decision: 'APPROVED' | 'REJECTED';
    decidedAt: string;
    comments: string;
    modificationsApplied?: string;
  };
  executionResult?: {
    executedByUserId: string;
    executedByUserName: string;
    executedAt: string;
    executionMode: 'SIMULATION';
    newShipmentsGenerated: Array<{
      shipmentId: string;
      carrier: string;
      mode: string;
      eta: string;
      orderId: string;
    }>;
    inventoryAdjustments: Array<{
      warehouseId: string;
      warehouseName: string;
      sku: string;
      quantityDeducted: number;
      remainingAvailable: number;
    }>;
    ordersUpdatedCount: number;
    auditLogId: string;
  };
}

export type AuditEventType =
  | 'INCIDENT_CREATED'
  | 'RISK_SCORES_EVALUATED'
  | 'PROPOSAL_GENERATED'
  | 'PROPOSAL_MODIFIED'
  | 'APPROVAL_BLOCKED_POLICY_VIOLATION'
  | 'PROPOSAL_APPROVED'
  | 'PROPOSAL_REJECTED'
  | 'SIMULATION_EXECUTION_STARTED'
  | 'SIMULATION_EXECUTION_COMPLETED'
  | 'EXECUTION_BLOCKED_NOT_APPROVED'
  | 'INVENTORY_REALLOCATED'
  | 'SYSTEM_DATABASE_RESET';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  actor: {
    id: string;
    name: string;
    role: UserRole;
    department?: string;
  };
  entityType: 'INCIDENT' | 'PROPOSAL' | 'SHIPMENT' | 'ORDER' | 'INVENTORY' | 'SYSTEM';
  entityId: string;
  summary: string;
  isSimulated: boolean;
  metadata: Record<string, any>;
}

export interface SystemStateSummary {
  incidentCount: number;
  activeShipmentsCount: number;
  affectedOrdersCount: number;
  proposalsCount: number;
  auditTrailCount: number;
}
