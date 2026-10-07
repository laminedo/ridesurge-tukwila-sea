import type { LatLng, StagingSpot, Zone, ZoneId } from './types';

export const HOME_BASE: LatLng & { label: string } = {
  lat: 47.459,
  lng: -122.2585,
  label: 'Tukwila · Southcenter',
};

/**
 * `radar` is a hand-tuned schematic position (north up). True geography would
 * stack six Seattle zones inside one thumb-width, so the layout keeps the
 * compass relationships and gives every zone a tappable blip.
 */
export const ZONES: Zone[] = [
  { id: 'SEA', code: 'SEA', name: 'Sea-Tac Airport', area: 'Arrivals · rideshare queue', lat: 47.4436, lng: -122.301, radar: { x: 33, y: 78 } },
  { id: 'TUK', code: 'TUK', name: 'Tukwila', area: 'Southcenter · hotel strip', lat: 47.459, lng: -122.2585, radar: { x: 55, y: 74 } },
  { id: 'REN', code: 'RTN', name: 'Renton', area: 'The Landing · Boeing', lat: 47.4985, lng: -122.2025, radar: { x: 76, y: 62 } },
  { id: 'KNT', code: 'KENT', name: 'Kent', area: 'Kent Station · ShoWare', lat: 47.3843, lng: -122.2334, radar: { x: 63, y: 90 } },
  { id: 'SODO', code: 'SODO', name: 'Stadium District', area: 'Lumen Field · T-Mobile Park', lat: 47.5935, lng: -122.332, radar: { x: 42, y: 57 } },
  { id: 'DTN', code: 'DTN', name: 'Downtown', area: 'Retail core · Belltown', lat: 47.6105, lng: -122.337, radar: { x: 38.5, y: 39.5 } },
  { id: 'CAP', code: 'CAP', name: 'Capitol Hill', area: 'Pike/Pine nightlife', lat: 47.615, lng: -122.3205, radar: { x: 58.5, y: 29.5 } },
  { id: 'SLU', code: 'SLU', name: 'South Lake Union', area: 'Amazon campus', lat: 47.6235, lng: -122.337, radar: { x: 40.5, y: 21.5 } },
  { id: 'LQA', code: 'LQA', name: 'Uptown', area: 'Climate Pledge · Seattle Center', lat: 47.6221, lng: -122.354, radar: { x: 22, y: 27 } },
  { id: 'UDX', code: 'UW', name: 'U-District', area: 'UW · Husky Stadium', lat: 47.659, lng: -122.311, radar: { x: 55, y: 10.5 } },
  { id: 'BEL', code: 'BEL', name: 'Bellevue', area: 'Downtown · Lincoln Square', lat: 47.615, lng: -122.201, radar: { x: 83, y: 34 } },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>;

/**
 * The first spot listed for a zone is its default. Addresses, not the
 * approximate coordinates, are what the navigation apps receive.
 */
export const STAGING_SPOTS: StagingSpot[] = [
  { id: 'sea-160', zoneId: 'SEA', official: true, name: 'S 160th St waiting lot', address: '3037 S 160th St, SeaTac, WA 98188', note: 'Airport waiting lot. Being inside it places you in the pickup queue.', lat: 47.4603, lng: -122.2935 },
  { id: 'sea-171', zoneId: 'SEA', official: true, name: 'S 171st St waiting area', address: '2902 S 171st St, SeaTac, WA 98188', note: 'Second waiting area. Check your driver app for the lot your platform assigns.', lat: 47.4504, lng: -122.2955 },
  { id: 'tuk-mall', zoneId: 'TUK', official: false, name: 'Westfield Southcenter', address: 'Westfield Southcenter, 2800 Southcenter Mall, Tukwila, WA 98188', note: 'Central to the hotel strip, about 8 minutes from the airport lot.', lat: 47.4588, lng: -122.2585 },
  { id: 'tuk-tibs', zoneId: 'TUK', official: false, name: 'Tukwila Intl Blvd Station', address: 'Tukwila International Boulevard Station, Tukwila, WA 98188', note: 'Light-rail park-and-ride, one exit from the airport.', lat: 47.464, lng: -122.2884 },
  { id: 'ren-landing', zoneId: 'REN', official: false, name: 'The Landing', address: 'The Landing, Renton, WA 98057', note: 'Retail and dining hub beside the Boeing plant and I-405.', lat: 47.4985, lng: -122.2025 },
  { id: 'knt-showare', zoneId: 'KNT', official: false, name: 'ShoWare Center · W James St', address: 'accesso ShoWare Center, 625 W James St, Kent, WA 98032', note: 'Arena lot edge; Kent Station is two blocks east.', lat: 47.3878, lng: -122.2378 },
  { id: 'knt-station', zoneId: 'KNT', official: false, name: 'Kent Station', address: 'Kent Station, 417 Ramsay Way, Kent, WA 98032', note: 'Sounder station, cinema and restaurants.', lat: 47.3843, lng: -122.2334 },
  { id: 'sodo-holgate', zoneId: 'SODO', official: false, name: '1st Ave S & S Holgate St', address: '1st Ave S & S Holgate St, Seattle, WA 98134', note: 'Just south of the event-day street closures, with a quick loop back up 1st or 4th.', lat: 47.5862, lng: -122.3342 },
  { id: 'sodo-station', zoneId: 'SODO', official: false, name: 'SODO Station · S Lander St', address: 'SODO Station, Seattle, WA 98134', note: 'Further out; riders walk here to get clear of the crowd.', lat: 47.5803, lng: -122.3273 },
  { id: 'dtn-convention', zoneId: 'DTN', official: false, name: '9th Ave & Pine St', address: '9th Ave & Pine St, Seattle, WA 98101', note: 'Beside the Convention Center and Paramount Theatre.', lat: 47.6136, lng: -122.3312 },
  { id: 'dtn-belltown', zoneId: 'DTN', official: false, name: '2nd Ave & Lenora St', address: '2nd Ave & Lenora St, Seattle, WA 98121', note: 'Belltown edge: minutes to Benaroya Hall, Pier 66 and the retail core.', lat: 47.6128, lng: -122.3418 },
  { id: 'cap-broadway', zoneId: 'CAP', official: false, name: 'Broadway & E Pine St', address: 'Broadway & E Pine St, Seattle, WA 98122', note: 'Top of the Pike/Pine bar corridor.', lat: 47.6153, lng: -122.3209 },
  { id: 'cap-12th', zoneId: 'CAP', official: false, name: '12th Ave & E Madison St', address: '12th Ave & E Madison St, Seattle, WA 98122', note: 'Quieter side of the hill with easy turns onto Madison.', lat: 47.6126, lng: -122.3168 },
  { id: 'slu-westlake', zoneId: 'SLU', official: false, name: 'Westlake Ave N & Mercer St', address: 'Westlake Ave N & Mercer St, Seattle, WA 98109', note: 'Middle of the Amazon campus, next to the I-5 ramps.', lat: 47.6246, lng: -122.3385 },
  { id: 'lqa-republican', zoneId: 'LQA', official: false, name: '1st Ave N & Republican St', address: '1st Ave N & Republican St, Seattle, WA 98109', note: 'West side of Climate Pledge Arena.', lat: 47.6233, lng: -122.3555 },
  { id: 'lqa-5th', zoneId: 'LQA', official: false, name: '5th Ave N & Mercer St', address: '5th Ave N & Mercer St, Seattle, WA 98109', note: 'McCaw Hall side, with a fast exit to SR-99 and I-5.', lat: 47.6245, lng: -122.3474 },
  { id: 'lqa-pier91', zoneId: 'LQA', official: false, name: 'Pier 91 · Smith Cove', address: 'Smith Cove Cruise Terminal, 2001 W Garfield St, Seattle, WA 98119', note: 'Cruise mornings only. Follow terminal staff to the rideshare lane.', lat: 47.6325, lng: -122.3797 },
  { id: 'udx-montlake', zoneId: 'UDX', official: false, name: 'Montlake Blvd NE & NE Pacific St', address: 'Montlake Blvd NE & NE Pacific St, Seattle, WA 98195', note: 'South of Husky Stadium by UW Station.', lat: 47.6497, lng: -122.304 },
  { id: 'udx-45th', zoneId: 'UDX', official: false, name: 'NE 45th St & University Way NE', address: 'NE 45th St & University Way NE, Seattle, WA 98105', note: 'The Ave: Neptune Theatre and student nightlife.', lat: 47.6614, lng: -122.3133 },
  { id: 'bel-tc', zoneId: 'BEL', official: false, name: 'Bellevue Transit Center', address: 'Bellevue Transit Center, 10850 NE 6th St, Bellevue, WA 98004', note: 'Between the office towers and Meydenbauer Center.', lat: 47.6155, lng: -122.196 },
  { id: 'bel-way', zoneId: 'BEL', official: false, name: 'Bellevue Way NE & NE 8th St', address: 'Bellevue Way NE & NE 8th St, Bellevue, WA 98004', note: 'Bellevue Square and Lincoln Square corner.', lat: 47.6174, lng: -122.201 },
];

export const SPOT_BY_ID: Record<string, StagingSpot> = Object.fromEntries(
  STAGING_SPOTS.map((s) => [s.id, s]),
);

export const spotsForZone = (zoneId: ZoneId) => STAGING_SPOTS.filter((s) => s.zoneId === zoneId);

export const defaultSpot = (zoneId: ZoneId) => spotsForZone(zoneId)[0];
