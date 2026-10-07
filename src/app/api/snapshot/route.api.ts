import { buildSnapshot, respond } from '@/lib/snapshot';

/** Flights, venue egress and the surge forecast in one payload (what the app polls). */
export const GET = (request: Request) => respond(request, (at) => buildSnapshot(at));
