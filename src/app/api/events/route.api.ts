import { buildEventFeed } from '@/lib/sim/events';
import { respond } from '@/lib/snapshot';

/** Stadium and venue schedule with estimated dismissal times and egress curves. */
export const GET = (request: Request) => respond(request, buildEventFeed);
