import { buildFlightFeed } from '@/lib/sim/flights';
import { respond } from '@/lib/snapshot';

/** Sea-Tac arrivals with the 20–35 minute touchdown-to-request lag applied. */
export const GET = (request: Request) => respond(request, buildFlightFeed);
