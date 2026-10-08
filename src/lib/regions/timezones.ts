/** IANA time zone for a US location from its state, with the larger split states handled by longitude. */
const EASTERN = 'CT DC DE GA MA MD ME NC NH NJ NY OH PA RI SC VA VT WV'.split(' ');
const CENTRAL = 'AL AR IA IL KS LA MN MO MS ND NE OK SD WI'.split(' ');
const MOUNTAIN = 'CO MT NM UT WY'.split(' ');
const PACIFIC = 'CA NV WA'.split(' ');

export function timeZoneFor(state: string, lat: number, lng: number): string {
  if (EASTERN.includes(state)) return 'America/New_York';
  if (CENTRAL.includes(state)) return 'America/Chicago';
  if (MOUNTAIN.includes(state)) return 'America/Denver';
  if (PACIFIC.includes(state)) return 'America/Los_Angeles';
  switch (state) {
    case 'FL':
      return lng < -85.2 ? 'America/Chicago' : 'America/New_York';
    case 'MI':
      return 'America/Detroit';
    case 'IN':
      return lng < -86.9 && (lat > 41 || lat < 38.3) ? 'America/Chicago' : 'America/Indiana/Indianapolis';
    case 'KY':
      return lng < -86 ? 'America/Chicago' : 'America/New_York';
    case 'TN':
      return lng > -85 ? 'America/New_York' : 'America/Chicago';
    case 'TX':
      return lng < -104.8 ? 'America/Denver' : 'America/Chicago';
    case 'AZ':
      return 'America/Phoenix';
    case 'ID':
      return lat > 45.5 ? 'America/Los_Angeles' : 'America/Boise';
    case 'OR':
      return lng > -117.3 && lat < 44.5 ? 'America/Boise' : 'America/Los_Angeles';
    case 'AK':
      return 'America/Anchorage';
    case 'HI':
      return 'Pacific/Honolulu';
    default:
      return 'America/Chicago';
  }
}
