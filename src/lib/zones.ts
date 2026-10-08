import type { LatLng, StagingSpot, Zone, ZoneId } from './types';

export const HOME_BASE: LatLng & { label: string } = {
  lat: 47.459,
  lng: -122.2585,
  label: 'Tukwila · Southcenter',
};

/**
 * `radar` is a hand-tuned schematic position (north up). True geography would
 * stack the central Seattle zones inside one thumb-width, so the layout keeps
 * the compass relationships and gives every zone a tappable blip. Keep at
 * least 13 units between any two centres when adding one.
 */
export const ZONES: Zone[] = [
  { id: 'SEA', code: 'SEA', name: 'Sea-Tac Airport', area: 'Arrivals · rideshare queue', lat: 47.4436, lng: -122.301, radar: { x: 39, y: 76 } },
  { id: 'TUK', code: 'TUK', name: 'Tukwila', area: 'Southcenter · hotel strip', lat: 47.459, lng: -122.2585, radar: { x: 56, y: 71 } },
  { id: 'REN', code: 'RTN', name: 'Renton', area: 'The Landing · Boeing', lat: 47.4985, lng: -122.2025, radar: { x: 72, y: 62 } },
  { id: 'KNT', code: 'KENT', name: 'Kent', area: 'Kent Station · ShoWare', lat: 47.3843, lng: -122.2334, radar: { x: 66, y: 84 } },
  { id: 'BUR', code: 'BUR', name: 'Burien', area: 'Olde Burien · transit center', lat: 47.4695, lng: -122.3395, radar: { x: 24, y: 78 } },
  { id: 'FDW', code: 'FDW', name: 'Federal Way', area: 'The Commons · transit center', lat: 47.3145, lng: -122.313, radar: { x: 46, y: 91 } },
  { id: 'WSE', code: 'WSEA', name: 'West Seattle', area: 'Alaska Junction · Alki', lat: 47.5612, lng: -122.3868, radar: { x: 17, y: 64 } },
  { id: 'SODO', code: 'SODO', name: 'Stadium District', area: 'Lumen Field · T-Mobile Park', lat: 47.5935, lng: -122.332, radar: { x: 45, y: 56 } },
  { id: 'DTN', code: 'DTN', name: 'Downtown', area: 'Retail core · Belltown · Pioneer Sq', lat: 47.6105, lng: -122.337, radar: { x: 31, y: 53 } },
  { id: 'CAP', code: 'CAP', name: 'Capitol Hill', area: 'Pike/Pine nightlife', lat: 47.615, lng: -122.3205, radar: { x: 52, y: 42 } },
  { id: 'SLU', code: 'SLU', name: 'South Lake Union', area: 'Amazon campus', lat: 47.6235, lng: -122.337, radar: { x: 37, y: 41 } },
  { id: 'LQA', code: 'LQA', name: 'Uptown', area: 'Climate Pledge · Seattle Center', lat: 47.6221, lng: -122.354, radar: { x: 22, y: 40 } },
  { id: 'FRE', code: 'FRE', name: 'Fremont', area: 'Fremont · Wallingford', lat: 47.6505, lng: -122.3499, radar: { x: 36, y: 28 } },
  { id: 'BAL', code: 'BAL', name: 'Ballard', area: 'Ballard Ave · Market St', lat: 47.6687, lng: -122.3847, radar: { x: 20, y: 26 } },
  { id: 'UDX', code: 'UW', name: 'U-District', area: 'UW · Husky Stadium', lat: 47.659, lng: -122.311, radar: { x: 53, y: 28 } },
  { id: 'NGT', code: 'NGT', name: 'Northgate', area: 'Northgate Station · Lake City', lat: 47.706, lng: -122.325, radar: { x: 58, y: 15 } },
  { id: 'AUR', code: 'AUR', name: 'Aurora', area: 'Aurora Ave N · Greenwood', lat: 47.7235, lng: -122.3447, radar: { x: 33, y: 14 } },
  { id: 'SHO', code: 'SHL', name: 'Shoreline', area: 'Aurora Village · light rail', lat: 47.756, lng: -122.342, radar: { x: 46, y: 7 } },
  { id: 'BEL', code: 'BEL', name: 'Bellevue', area: 'Downtown · Lincoln Square', lat: 47.615, lng: -122.201, radar: { x: 80, y: 44 } },
  { id: 'KRK', code: 'KRK', name: 'Kirkland', area: 'Downtown · Totem Lake', lat: 47.6755, lng: -122.208, radar: { x: 72, y: 20 } },
  { id: 'RDM', code: 'RDM', name: 'Redmond', area: 'Microsoft · downtown', lat: 47.674, lng: -122.124, radar: { x: 86, y: 30 } },
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
  { id: 'dtn-pike', zoneId: 'DTN', official: false, name: '1st Ave & Pike St', address: '1st Ave & Pike St, Seattle, WA 98101', note: 'Pike Place Market corner: The Showbox and Showgirls are on this block.', lat: 47.6089, lng: -122.3403 },
  { id: 'dtn-pioneer', zoneId: 'DTN', official: false, name: 'Occidental Ave S & S Washington St', address: 'Occidental Ave S & S Washington St, Seattle, WA 98104', note: 'Pioneer Square clubs, a short walk from Trinity.', lat: 47.6009, lng: -122.3331 },
  { id: 'sodo-georgetown', zoneId: 'SODO', official: false, name: '4th Ave S & S Michigan St', address: '4th Ave S & S Michigan St, Seattle, WA 98108', note: 'Georgetown end of 4th Ave, by Kittens Cabaret.', lat: 47.5495, lng: -122.3295 },
  { id: 'bal-market', zoneId: 'BAL', official: false, name: 'NW Market St & 22nd Ave NW', address: 'NW Market St & 22nd Ave NW, Seattle, WA 98107', note: 'Top of Ballard Ave: bars, restaurants and the Tractor Tavern.', lat: 47.6687, lng: -122.3847 },
  { id: 'fre-center', zoneId: 'FRE', official: false, name: 'N 35th St & Fremont Ave N', address: 'N 35th St & Fremont Ave N, Seattle, WA 98103', note: 'Centre of Fremont, a block from Nectar Lounge.', lat: 47.6505, lng: -122.3499 },
  { id: 'ngt-station', zoneId: 'NGT', official: false, name: 'Northgate Station', address: 'Northgate Station, 10200 1st Ave NE, Seattle, WA 98125', note: 'Light-rail terminus beside the mall and I-5.', lat: 47.703, lng: -122.328 },
  { id: 'aur-130', zoneId: 'AUR', official: false, name: 'Aurora Ave N & N 130th St', address: 'Aurora Ave N & N 130th St, Seattle, WA 98133', note: 'Middle of the north Aurora corridor.', lat: 47.7235, lng: -122.3447 },
  { id: 'sho-village', zoneId: 'SHO', official: false, name: 'Aurora Village Transit Center', address: 'Aurora Village Transit Center, Shoreline, WA 98133', note: 'North end of Aurora at the county line.', lat: 47.7745, lng: -122.341 },
  { id: 'wse-junction', zoneId: 'WSE', official: false, name: 'California Ave SW & SW Alaska St', address: 'California Ave SW & SW Alaska St, Seattle, WA 98116', note: 'The Alaska Junction, heart of West Seattle.', lat: 47.5612, lng: -122.3868 },
  { id: 'bur-tc', zoneId: 'BUR', official: false, name: 'Burien Transit Center', address: 'Burien Transit Center, Burien, WA 98166', note: 'Ten minutes west of the airport lot.', lat: 47.4695, lng: -122.3395 },
  { id: 'fdw-commons', zoneId: 'FDW', official: false, name: 'The Commons at Federal Way', address: 'The Commons at Federal Way, Federal Way, WA 98003', note: 'Mall and transit center just off I-5.', lat: 47.3145, lng: -122.313 },
  { id: 'krk-downtown', zoneId: 'KRK', official: false, name: 'Kirkland Ave & Lake St S', address: 'Kirkland Ave & Lake St S, Kirkland, WA 98033', note: 'Waterfront restaurants and bars.', lat: 47.6755, lng: -122.208 },
  { id: 'rdm-station', zoneId: 'RDM', official: false, name: 'Downtown Redmond Station', address: 'Downtown Redmond Station, Redmond, WA 98052', note: 'Light-rail terminus near Redmond Town Center.', lat: 47.6715, lng: -122.118 },
];

export const SPOT_BY_ID: Record<string, StagingSpot> = Object.fromEntries(
  STAGING_SPOTS.map((s) => [s.id, s]),
);

export const spotsForZone = (zoneId: ZoneId) => STAGING_SPOTS.filter((s) => s.zoneId === zoneId);

export const defaultSpot = (zoneId: ZoneId) => spotsForZone(zoneId)[0];
