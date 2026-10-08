/**
 * When hotels put riders on the kerb. Not a booking feed: a simple daily
 * rhythm (checkout and airport runs in the morning, dinner in the evening,
 * late returns) scaled by the size of the hotel.
 */

/** Share of a hotel's daily ride requests falling in each local hour. */
const HOURLY = [1.5, 0.8, 0.5, 0.8, 3, 6, 8.5, 9, 7.5, 6, 4.5, 4, 3.5, 3.5, 3.5, 4, 5, 7, 7.5, 6, 4.5, 4, 3.5, 2.5];
const TOTAL = HOURLY.reduce((s, n) => s + n, 0);
/** Ride requests per occupied room per day. */
const RIDES_PER_ROOM = 0.45;

/** Expected ride requests from a hotel during the local hour starting at `hour`. */
export function hotelPickups(rooms: number, dow: number, hour: number): number {
  const occupancy = dow === 5 || dow === 6 ? 0.86 : dow === 0 ? 0.68 : 0.76;
  return rooms * occupancy * RIDES_PER_ROOM * (HOURLY[Math.floor(((hour % 24) + 24) % 24)] / TOTAL);
}

/** Plain-language read of the daily rhythm at this hour. */
export function hotelMoment(hour: number): string {
  if (hour >= 4 && hour < 10) return 'Morning checkouts and airport runs';
  if (hour >= 16 && hour < 20) return 'Guests heading out for the evening';
  if (hour >= 20 || hour < 1) return 'Late returns and nights out';
  return hour < 4 ? 'Quiet overnight' : 'Steady daytime trips';
}
