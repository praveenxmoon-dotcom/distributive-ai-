import { Request, Response, NextFunction } from 'express';
import { User, UserRole, SessionInfo } from '../types/index.ts';
import { db } from './db.ts';

// Extend Express Request interface to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

// In-memory active session store
interface SessionData {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

const activeSessions = new Map<string, SessionData>();

// Initialize standard demo session tokens for all baseline users
export function initDemoSessions(): void {
  const users = db.getUsers();
  for (const user of users) {
    const demoToken = `token-demo-${user.id}`;
    activeSessions.set(demoToken, {
      token: demoToken,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    });
  }
}

// Create a new session for a user
export function createSession(user: User): SessionInfo {
  // Generate random token with demo prefix
  const token = `token-${user.id}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  const session: SessionData = {
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  };
  activeSessions.set(token, session);
  return {
    token,
    user,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  };
}

// Invalidate session
export function invalidateSession(token: string): boolean {
  return activeSessions.delete(token);
}

// Validate token and return associated User
export function validateToken(token?: string): User | null {
  if (!token) return null;
  // Ensure token is formatted properly
  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  if (!cleanToken) return null;

  const session = activeSessions.get(cleanToken);
  if (!session) return null;

  // Check expiration
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    activeSessions.delete(cleanToken);
    return null;
  }

  const user = db.getUserById(session.userId);
  return user || null;
}

// Get or issue standard token for a user ID (for tests and quick bootstrapping)
export function getStandardTokenForUser(userId: string): string {
  const token = `token-demo-${userId}`;
  if (!activeSessions.has(token)) {
    const user = db.getUserById(userId);
    if (user) {
      activeSessions.set(token, {
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      });
    }
  }
  return token;
}

// Express Middleware: Require Valid Authentication
// Enforces that x-user-id or body.userId are NEVER accepted as proof of identity.
// Only a validated Bearer token issued by this server is accepted.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({
      error: 'Authentication Required: Missing Authorization header. Provide a valid Bearer token.',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: 'Authentication Required: Malformed Authorization header. Expected "Bearer <token>".',
      code: 'AUTH_MALFORMED'
    });
    return;
  }

  const token = parts[1];
  const user = validateToken(token);
  if (!user) {
    res.status(401).json({
      error: 'Authentication Failed: Invalid or expired session token. Please re-authenticate.',
      code: 'AUTH_INVALID_TOKEN'
    });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

// Express Middleware: Require Specific Role(s)
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication Required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Permission Denied: User '${req.user.name}' has role '${req.user.role}', which is not authorized for this operation. Required role(s): [${allowedRoles.join(', ')}].`,
        code: 'FORBIDDEN_ROLE',
        userRole: req.user.role,
        requiredRoles: allowedRoles
      });
      return;
    }

    next();
  };
}
