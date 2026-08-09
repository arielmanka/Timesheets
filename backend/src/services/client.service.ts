import { Client, type IClient } from '../models/Client.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateClientData {
  name: string;
  billingContact: string;
  billingEmail: string;
  billingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  taxId?: string | null;
}

export type UpdateClientData = Partial<CreateClientData>;

// ---------------------------------------------------------------------------
// Create (CPT-1, CPT-2)
// ---------------------------------------------------------------------------
export async function createClient(teamId: string, data: CreateClientData): Promise<IClient> {
  const client = new Client({
    teamId,
    ...data,
  });

  await client.save();

  logger.info({ clientId: client._id, teamId }, 'Client created');
  return client;
}

// ---------------------------------------------------------------------------
// List by team
// ---------------------------------------------------------------------------
export async function listClients(teamId: string): Promise<IClient[]> {
  return Client.find({ teamId }).sort({ name: 1 });
}

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------
export async function getClientById(clientId: string, teamId: string): Promise<IClient> {
  const client = await Client.findOne({ _id: clientId, teamId });
  if (!client) {
    throw AppError.notFound('Client not found');
  }
  return client;
}

// ---------------------------------------------------------------------------
// Update (CPT-2)
// ---------------------------------------------------------------------------
export async function updateClient(
  clientId: string,
  teamId: string,
  data: UpdateClientData
): Promise<IClient> {
  const client = await Client.findOneAndUpdate(
    { _id: clientId, teamId },
    { $set: data },
    { new: true, runValidators: true }
  );

  if (!client) {
    throw AppError.notFound('Client not found');
  }

  logger.info({ clientId, teamId }, 'Client updated');
  return client;
}
