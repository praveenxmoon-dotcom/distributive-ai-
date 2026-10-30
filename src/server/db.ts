import fs from 'fs';
import path from 'path';
import { 
  User, 
  Warehouse, 
  InventoryItem, 
  Shipment, 
  Order, 
  DisruptionIncident, 
  RecoveryProposal, 
  AuditLogEntry 
} from '../types/index.ts';

export interface DatabaseSchema {
  users: User[];
  warehouses: Warehouse[];
  inventories: InventoryItem[];
  shipments: Shipment[];
  orders: Order[];
  incidents: DisruptionIncident[];
  proposals: RecoveryProposal[];
  auditLogs: AuditLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'disruptioniq_data.json');

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin-01',
    name: 'Devika Roy',
    email: 'devika.roy@disruptioniq.internal',
    role: 'ADMINISTRATOR',
    title: 'Enterprise Supply Chain System Administrator',
    department: 'IT & Supply Chain Governance',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-scm-01',
    name: 'Praveen Sharma',
    email: 'praveen.sharma@disruptioniq.internal',
    role: 'SUPPLY_CHAIN_MANAGER',
    title: 'Senior Director of Supply Chain & Fulfillment',
    department: 'Global Supply Chain Operations',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-scm-02',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@disruptioniq.internal',
    role: 'SUPPLY_CHAIN_MANAGER',
    title: 'Regional Supply Chain Manager (South Zone)',
    department: 'Regional Logistics South',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-disp-01',
    name: 'Arun Verma',
    email: 'arun.verma@disruptioniq.internal',
    role: 'DISPATCHER',
    title: 'North-South Corridor Dispatch Supervisor',
    department: 'Delhi DC Control Tower',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-ops-01',
    name: 'Meera Nair',
    email: 'meera.nair@disruptioniq.internal',
    role: 'OPERATIONS_PLANNER',
    title: 'Strategic Inventory & Recovery Planner',
    department: 'Operations Planning & Escalations',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
  },
  {
    id: 'user-auditor-01',
    name: 'Vikram Malhotra',
    email: 'vikram.malhotra@disruptioniq.internal',
    role: 'AUDITOR',
    title: 'Supply Chain Governance & Compliance Officer',
    department: 'Internal Audit & Risk',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80'
  }
];

// EXACTLY TWO COMPANY WAREHOUSES: DELHI AND CHENNAI
export const INITIAL_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-del-01',
    code: 'DEL-DC-01',
    name: 'Delhi Central Distribution Center',
    city: 'Delhi NCR',
    state: 'Delhi',
    type: 'CENTRAL_DC',
    coordinates: { lat: 28.6139, lng: 77.2090 },
    operatingHours: '24/7 Operations',
    handlingFeePerUnit: 45
  },
  {
    id: 'wh-maa-02',
    code: 'MAA-DC-02',
    name: 'Chennai Fulfillment Hub',
    city: 'Chennai',
    state: 'Tamil Nadu',
    type: 'FULFILLMENT_CENTER',
    coordinates: { lat: 13.0827, lng: 80.2707 },
    operatingHours: '24/7 Operations',
    handlingFeePerUnit: 55
  }
];

// INVENTORIES STRICTLY TIED TO DELHI AND CHENNAI ONLY
export const INITIAL_INVENTORIES: InventoryItem[] = [
  // SKU-MED-901: Cold-Chain Diagnostic Reagents
  {
    id: 'inv-del-med',
    warehouseId: 'wh-del-01',
    sku: 'SKU-MED-901',
    productName: 'Cold-Chain Diagnostic Reagents (Bio-Analyzer Kits)',
    category: 'Cold-Chain Pharma',
    quantityOnHand: 240,
    reservedQuantity: 30, // 30 on shipment SHP-DEL-MAA-9042
    availableQuantity: 210,
    unitCost: 15000,
    weightKg: 4.2,
    storageCondition: '2-8°C Cold Chain'
  },
  {
    id: 'inv-maa-med',
    warehouseId: 'wh-maa-02',
    sku: 'SKU-MED-901',
    productName: 'Cold-Chain Diagnostic Reagents (Bio-Analyzer Kits)',
    category: 'Cold-Chain Pharma',
    quantityOnHand: 4,
    reservedQuantity: 4,
    availableQuantity: 0, // Depleted locally in Chennai!
    unitCost: 15000,
    weightKg: 4.2,
    storageCondition: '2-8°C Cold Chain'
  },

  // SKU-AUTO-404: Electronic Control Modules ECM-9
  {
    id: 'inv-del-auto',
    warehouseId: 'wh-del-01',
    sku: 'SKU-AUTO-404',
    productName: 'Tier-1 Automotive ECM-9 Engine Micro-Controllers',
    category: 'Automotive Spares',
    quantityOnHand: 180,
    reservedQuantity: 25,
    availableQuantity: 155,
    unitCost: 35000,
    weightKg: 1.8,
    storageCondition: 'Controlled Climate'
  },
  {
    id: 'inv-maa-auto',
    warehouseId: 'wh-maa-02',
    sku: 'SKU-AUTO-404',
    productName: 'Tier-1 Automotive ECM-9 Engine Micro-Controllers',
    category: 'Automotive Spares',
    quantityOnHand: 0,
    reservedQuantity: 0,
    availableQuantity: 0, // Zero safety stock in Chennai
    unitCost: 35000,
    weightKg: 1.8,
    storageCondition: 'Controlled Climate'
  },

  // SKU-SOLAR-210: Inverter Circuit Boards
  {
    id: 'inv-del-solar',
    warehouseId: 'wh-del-01',
    sku: 'SKU-SOLAR-210',
    productName: 'Industrial Inverter Power Distribution Boards',
    category: 'Renewable Energy',
    quantityOnHand: 90,
    reservedQuantity: 15,
    availableQuantity: 75,
    unitCost: 22000,
    weightKg: 8.5,
    storageCondition: 'Ambient'
  },
  {
    id: 'inv-maa-solar',
    warehouseId: 'wh-maa-02',
    sku: 'SKU-SOLAR-210',
    productName: 'Industrial Inverter Power Distribution Boards',
    category: 'Renewable Energy',
    quantityOnHand: 2,
    reservedQuantity: 0,
    availableQuantity: 2,
    unitCost: 22000,
    weightKg: 8.5,
    storageCondition: 'Ambient'
  },

  // SKU-RETL-105: Smart Display Consoles
  {
    id: 'inv-del-retl',
    warehouseId: 'wh-del-01',
    sku: 'SKU-RETL-105',
    productName: 'Commercial Smart POS & Interactive Display Consoles',
    category: 'Consumer Electronics',
    quantityOnHand: 400,
    reservedQuantity: 50,
    availableQuantity: 350,
    unitCost: 13000,
    weightKg: 3.1,
    storageCondition: 'Ambient'
  },
  {
    id: 'inv-maa-retl',
    warehouseId: 'wh-maa-02',
    sku: 'SKU-RETL-105',
    productName: 'Commercial Smart POS & Interactive Display Consoles',
    category: 'Consumer Electronics',
    quantityOnHand: 15,
    reservedQuantity: 0,
    availableQuantity: 15,
    unitCost: 13000,
    weightKg: 3.1,
    storageCondition: 'Ambient'
  }
];

export const INITIAL_SHIPMENTS: Shipment[] = [
  {
    id: 'shp-del-maa-9042',
    trackingNumber: 'SHP-DEL-MAA-9042',
    originWarehouseId: 'wh-del-01',
    destinationWarehouseId: 'wh-maa-02',
    carrier: 'Apex Logistics India Ltd.',
    vehicleType: 'Tata Signa 4825.TK Heavy Hauler (40ft High Cube)',
    vehicleRegistration: 'DL-01-AX-9942',
    driverName: 'Rajesh Kumar Yadav',
    driverPhone: '+91 98112 40912',
    routeCorridor: 'NH-44 Central-South Spine Corridor (Delhi - Agra - Gwalior - Nagpur - Hyderabad - Kurnool - Chennai)',
    totalDistanceKm: 2180,
    distanceTraveledKm: 742,
    status: 'IN_TRANSIT',
    departureTime: '2026-10-29T06:00:00.000Z',
    originalEta: '2026-10-31T18:00:00.000Z',
    currentEta: '2026-10-31T18:00:00.000Z',
    delayHours: 0,
    milestones: [
      {
        id: 'ms-01',
        locationName: 'Delhi Central DC (DEL-DC-01) - Dispatched',
        coordinates: { lat: 28.6139, lng: 77.2090 },
        status: 'COMPLETED',
        plannedTimestamp: '2026-10-29T06:00:00.000Z',
        actualTimestamp: '2026-10-29T06:12:00.000Z'
      },
      {
        id: 'ms-02',
        locationName: 'Agra Bypass Highway Toll Plaza',
        coordinates: { lat: 27.1767, lng: 78.0081 },
        status: 'COMPLETED',
        plannedTimestamp: '2026-10-29T11:30:00.000Z',
        actualTimestamp: '2026-10-29T11:45:00.000Z'
      },
      {
        id: 'ms-03',
        locationName: 'Gwalior Transit Corridor Checkpoint',
        coordinates: { lat: 26.2183, lng: 78.1828 },
        status: 'COMPLETED',
        plannedTimestamp: '2026-10-29T16:00:00.000Z',
        actualTimestamp: '2026-10-29T16:10:00.000Z'
      },
      {
        id: 'ms-04',
        locationName: 'Nagpur / Hinganghat Highway Transit Waypoint (KM 742 on NH-44)',
        coordinates: { lat: 20.5600, lng: 78.8400 },
        status: 'CURRENT_INCIDENT',
        plannedTimestamp: '2026-10-30T04:30:00.000Z',
        actualTimestamp: '2026-10-30T04:45:00.000Z'
      },
      {
        id: 'ms-05',
        locationName: 'Hyderabad Freight Transit Node',
        coordinates: { lat: 17.3850, lng: 78.4867 },
        status: 'PENDING',
        plannedTimestamp: '2026-10-30T20:00:00.000Z'
      },
      {
        id: 'ms-06',
        locationName: 'Chennai Fulfillment Hub (MAA-DC-02) Receiving Dock',
        coordinates: { lat: 13.0827, lng: 80.2707 },
        status: 'PENDING',
        plannedTimestamp: '2026-10-31T18:00:00.000Z'
      }
    ],
    orderIds: ['ord-7801', 'ord-7802', 'ord-7803', 'ord-7804']
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-7801',
    orderNumber: 'ORD-7801',
    customerName: 'Apollo Specialty Hospitals (Greams Road, Chennai)',
    customerTier: 'TIER_1_STRATEGIC',
    industry: 'Healthcare & Critical Diagnostics',
    destinationCity: 'Chennai',
    shipmentId: 'shp-del-maa-9042',
    items: [
      {
        sku: 'SKU-MED-901',
        productName: 'Cold-Chain Diagnostic Reagents (Bio-Analyzer Kits)',
        quantity: 30,
        unitPrice: 15000,
        totalPrice: 450000
      }
    ],
    totalValue: 450000,
    committedSla: '2026-10-31T20:00:00.000Z',
    estimatedDelivery: '2026-10-31T18:00:00.000Z',
    status: 'ON_SCHEDULE',
    dailyPenaltyAmount: 35000,
    operationalImpact: 'CRITICAL: Scheduled neuro-oncology diagnostic testing sessions. Any delay > 4h causes cancellation of 40 patient procedures.',
    priorityTier: 'CRITICAL'
  },
  {
    id: 'ord-7802',
    orderNumber: 'ORD-7802',
    customerName: 'Hyundai Motors India Manufacturing Plant (Sriperumbudur)',
    customerTier: 'TIER_1_STRATEGIC',
    industry: 'Automotive Manufacturing (Just-In-Time)',
    destinationCity: 'Chennai',
    shipmentId: 'shp-del-maa-9042',
    items: [
      {
        sku: 'SKU-AUTO-404',
        productName: 'Tier-1 Automotive ECM-9 Engine Micro-Controllers',
        quantity: 25,
        unitPrice: 35000,
        totalPrice: 875000
      }
    ],
    totalValue: 875000,
    committedSla: '2026-11-01T08:00:00.000Z',
    estimatedDelivery: '2026-10-31T18:00:00.000Z',
    status: 'ON_SCHEDULE',
    dailyPenaltyAmount: 120000,
    operationalImpact: 'CATASTROPHIC: Assembly Line Stoppage. Plant line halts when buffer stock depletes Nov 1, 09:00 IST. Idle labor cost: ₹18,000/min.',
    priorityTier: 'CRITICAL'
  },
  {
    id: 'ord-7803',
    orderNumber: 'ORD-7803',
    customerName: 'Croma Retail Distribution Center (South Zone)',
    customerTier: 'TIER_3_STANDARD',
    industry: 'Consumer Electronics Retail',
    destinationCity: 'Chennai',
    shipmentId: 'shp-del-maa-9042',
    items: [
      {
        sku: 'SKU-RETL-105',
        productName: 'Commercial Smart POS & Interactive Display Consoles',
        quantity: 50,
        unitPrice: 13000,
        totalPrice: 650000
      }
    ],
    totalValue: 650000,
    committedSla: '2026-11-03T12:00:00.000Z',
    estimatedDelivery: '2026-10-31T18:00:00.000Z',
    status: 'ON_SCHEDULE',
    dailyPenaltyAmount: 8000,
    operationalImpact: 'LOW: Promotional weekend floor inventory display. Existing store inventory adequate for initial 4 days.',
    priorityTier: 'STANDARD'
  },
  {
    id: 'ord-7804',
    orderNumber: 'ORD-7804',
    customerName: 'SunTech MegaWatt Energy Systems (Ennore Facility)',
    customerTier: 'TIER_2_ENTERPRISE',
    industry: 'Clean Energy Infrastructure',
    destinationCity: 'Chennai',
    shipmentId: 'shp-del-maa-9042',
    items: [
      {
        sku: 'SKU-SOLAR-210',
        productName: 'Industrial Inverter Power Distribution Boards',
        quantity: 15,
        unitPrice: 22000,
        totalPrice: 330000
      }
    ],
    totalValue: 330000,
    committedSla: '2026-11-01T16:00:00.000Z',
    estimatedDelivery: '2026-10-31T18:00:00.000Z',
    status: 'ON_SCHEDULE',
    dailyPenaltyAmount: 25000,
    operationalImpact: 'MODERATE: Substation commissioning scheduled for Nov 2 morning. Delay pushes grid energization inspection by 1 week.',
    priorityTier: 'HIGH'
  }
];

export class Database {
  private static instance: Database;
  private data: DatabaseSchema;

  private constructor() {
    this.data = this.loadOrSeed();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private loadOrSeed(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Verify schema conforms to exactly 2 company warehouses
        if (
          parsed.users && 
          parsed.warehouses && 
          parsed.shipments &&
          Array.isArray(parsed.warehouses) &&
          parsed.warehouses.length === 2 &&
          parsed.warehouses.every((w: Warehouse) => w.code === 'DEL-DC-01' || w.code === 'MAA-DC-02')
        ) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[DB] Failed reading db file, re-seeding default demo state:', err);
    }

    const defaultData: DatabaseSchema = {
      users: INITIAL_USERS,
      warehouses: INITIAL_WAREHOUSES,
      inventories: INITIAL_INVENTORIES,
      shipments: INITIAL_SHIPMENTS,
      orders: INITIAL_ORDERS,
      incidents: [],
      proposals: [],
      auditLogs: [
        {
          id: 'audit-init-01',
          timestamp: new Date().toISOString(),
          eventType: 'SYSTEM_DATABASE_RESET',
          actor: {
            id: 'system',
            name: 'DisruptionIQ Platform Kernel',
            role: 'ADMINISTRATOR',
            department: 'System Architecture'
          },
          entityType: 'SYSTEM',
          entityId: 'system-seed',
          summary: 'Initialized baseline supply chain state: Exactly 2 Hubs (Delhi DEL-DC-01, Chennai MAA-DC-02), 4 SKUs, 1 active Delhi-Chennai shipment (SHP-DEL-MAA-9042), 4 customer orders.',
          isSimulated: false,
          metadata: {
            warehousesCount: 2,
            ordersCount: 4,
            baselineShipment: 'SHP-DEL-MAA-9042'
          }
        }
      ]
    };
    this.persist(defaultData);
    return defaultData;
  }

  /**
   * Persists database state to disk using atomic temporary file write and rename.
   * Throws an error on failure so persistence issues are NEVER swallowed silently.
   */
  public persist(data?: DatabaseSchema): void {
    if (data) this.data = data;
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Atomic write: write to temp file then rename
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
      console.error('[DB] Persistence failure:', err);
      throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to save changes to persistent disk storage: ${err.message}`);
    }
  }

  /**
   * Resets database state to default baseline.
   * Strictly requires an actor with the ADMINISTRATOR role.
   */
  public resetToDefault(actor: User): DatabaseSchema {
    if (actor.role !== 'ADMINISTRATOR') {
      throw new Error(`UNAUTHORIZED_RESET: Only users with the 'ADMINISTRATOR' role can reset the demo state. Current actor '${actor.name}' has role '${actor.role}'.`);
    }

    const resetAuditEntry: AuditLogEntry = {
      id: `audit-reset-${Date.now()}`,
      timestamp: new Date().toISOString(),
      eventType: 'SYSTEM_DATABASE_RESET',
      actor: {
        id: actor.id,
        name: actor.name,
        role: actor.role,
        department: actor.department
      },
      entityType: 'SYSTEM',
      entityId: 'system-reset',
      summary: `System state reset to clean 2-warehouse demo baseline by Administrator ${actor.name}.`,
      isSimulated: false,
      metadata: {
        resetBy: actor.name,
        role: actor.role,
        timestamp: new Date().toISOString()
      }
    };

    this.data = {
      users: JSON.parse(JSON.stringify(INITIAL_USERS)),
      warehouses: JSON.parse(JSON.stringify(INITIAL_WAREHOUSES)),
      inventories: JSON.parse(JSON.stringify(INITIAL_INVENTORIES)),
      shipments: JSON.parse(JSON.stringify(INITIAL_SHIPMENTS)),
      orders: JSON.parse(JSON.stringify(INITIAL_ORDERS)),
      incidents: [],
      proposals: [],
      auditLogs: [resetAuditEntry]
    };
    this.persist();
    return this.data;
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public getWarehouses(): Warehouse[] {
    return this.data.warehouses;
  }

  public getWarehouseById(id: string): Warehouse | undefined {
    return this.data.warehouses.find(w => w.id === id);
  }

  public getInventories(): InventoryItem[] {
    return this.data.inventories;
  }

  public getInventoryItem(warehouseId: string, sku: string): InventoryItem | undefined {
    return this.data.inventories.find(i => i.warehouseId === warehouseId && i.sku === sku);
  }

  public updateInventoryItem(item: InventoryItem): void {
    const idx = this.data.inventories.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      item.availableQuantity = item.quantityOnHand - item.reservedQuantity;
      this.data.inventories[idx] = item;
      this.persist();
    }
  }

  public getShipments(): Shipment[] {
    return this.data.shipments;
  }

  public getShipmentById(id: string): Shipment | undefined {
    return this.data.shipments.find(s => s.id === id);
  }

  public updateShipment(shipment: Shipment): void {
    const idx = this.data.shipments.findIndex(s => s.id === shipment.id);
    if (idx !== -1) {
      this.data.shipments[idx] = shipment;
    } else {
      this.data.shipments.push(shipment);
    }
    this.persist();
  }

  public getOrders(): Order[] {
    return this.data.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  public updateOrder(order: Order): void {
    const idx = this.data.orders.findIndex(o => o.id === order.id);
    if (idx !== -1) {
      this.data.orders[idx] = order;
      this.persist();
    }
  }

  public getIncidents(): DisruptionIncident[] {
    return this.data.incidents;
  }

  public getIncidentById(id: string): DisruptionIncident | undefined {
    return this.data.incidents.find(i => i.id === id);
  }

  public addIncident(incident: DisruptionIncident): void {
    this.data.incidents.unshift(incident);
    this.persist();
  }

  public updateIncident(incident: DisruptionIncident): void {
    const idx = this.data.incidents.findIndex(i => i.id === incident.id);
    if (idx !== -1) {
      this.data.incidents[idx] = incident;
      this.persist();
    }
  }

  public getProposals(): RecoveryProposal[] {
    return this.data.proposals;
  }

  public getProposalById(id: string): RecoveryProposal | undefined {
    return this.data.proposals.find(p => p.id === id);
  }

  public addProposal(proposal: RecoveryProposal): void {
    this.data.proposals.unshift(proposal);
    this.persist();
  }

  public updateProposal(proposal: RecoveryProposal): void {
    const idx = this.data.proposals.findIndex(p => p.id === proposal.id);
    if (idx !== -1) {
      this.data.proposals[idx] = proposal;
      this.persist();
    }
  }

  // AUDIT TRAIL: IMMUTABLE APPEND-ONLY (No edit or delete methods exist)
  public getAuditLogs(): AuditLogEntry[] {
    return this.data.auditLogs;
  }

  public addAuditLog(entry: AuditLogEntry): void {
    this.data.auditLogs.unshift(entry);
    this.persist();
  }
}

export const db = Database.getInstance();
