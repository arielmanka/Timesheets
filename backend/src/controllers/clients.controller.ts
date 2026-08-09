import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as clientService from '../services/client.service.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const billingAddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
});

const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(200),
  billingContact: z.string().min(1, 'Billing contact is required').max(200),
  billingEmail: z.string().email('Invalid billing email'),
  billingAddress: billingAddressSchema,
  taxId: z.string().max(50).nullable().optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  billingContact: z.string().min(1).max(200).optional(),
  billingEmail: z.string().email().optional(),
  billingAddress: billingAddressSchema.optional(),
  taxId: z.string().max(50).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams/:teamId/clients
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createClientSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const client = await clientService.createClient(teamReq.team.teamId, data);
    res.status(201).json({ client });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// GET /teams/:teamId/clients
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const clients = await clientService.listClients(teamReq.team.teamId);
    res.json({ clients });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/clients/:clientId
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const client = await clientService.getClientById(
      req.params.clientId as string,
      teamReq.team.teamId
    );
    res.json({ client });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/clients/:clientId
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateClientSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const client = await clientService.updateClient(
      req.params.clientId as string,
      teamReq.team.teamId,
      data
    );
    res.json({ client });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
