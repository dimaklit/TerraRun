import { createClient } from '@neon/neon-js';

const databaseUrl = import.meta.env?.VITE_NEON_DATABASE_URL;

export const neonClient = databaseUrl ? createClient(databaseUrl) : null;