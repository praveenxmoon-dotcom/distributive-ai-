import { AuditLogEntry, AuditEventType, User } from '../types/index.ts';
import { Database } from './db.ts';

export function recordAuditLog(
  db: Database,
  eventType: AuditEventType,
  actor: User,
  entityType: 'INCIDENT' | 'PROPOSAL' | 'SHIPMENT' | 'ORDER' | 'INVENTORY' | 'SYSTEM',
  entityId: string,
  summary: string,
  metadata: Record<string, any> = {},
  isSimulated = true
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: new Date().toISOString(),
    eventType,
    actor: {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      department: actor.department
    },
    entityType,
    entityId,
    summary,
    isSimulated,
    metadata
  };

  db.addAuditLog(entry);
  return entry;
}
