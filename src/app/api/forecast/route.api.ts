import { buildForecast } from '@/lib/forecast/surge';
import { respond } from '@/lib/snapshot';

/** TimesFM surge-multiplier forecast for every zone, 15-minute steps, 3 hours out. */
export const GET = (request: Request) => respond(request, buildForecast);
