/**
 * The larger hotels of the Seattle–Tacoma market, by zone. Room counts are
 * approximate and only rank how much business each one generates. Navigation
 * uses the hotel's name, so the map app finds the door.
 */
import type { Hotel } from '../types';

const hotels = (zoneId: string, list: readonly (readonly [string, number])[]): Hotel[] =>
  list.map(([name, rooms]) => ({
    id: `${zoneId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    zoneId,
    rooms,
    address: `${name}, Washington`,
  }));

export const SEATTLE_HOTELS: Hotel[] = [
  ...hotels('DTN', [
    ['Hyatt Regency Seattle', 1260],
    ['Sheraton Grand Seattle', 1236],
    ['The Westin Seattle', 891],
    ['Renaissance Seattle Hotel', 557],
    ['Grand Hyatt Seattle', 457],
    ['Fairmont Olympic Hotel', 450],
    ['W Seattle', 424],
    ['Crowne Plaza Seattle Downtown', 415],
    ['Seattle Marriott Waterfront', 361],
    ['Hilton Motif Seattle', 319],
    ['Embassy Suites Seattle Downtown Pioneer Square', 282],
    ['Hilton Seattle', 239],
    ['The Edgewater Hotel', 223],
    ['Kimpton Hotel Monaco Seattle', 189],
    ['Lotte Hotel Seattle', 189],
    ['Mayflower Park Hotel', 160],
    ['Thompson Seattle', 150],
  ]),
  ...hotels('SLU', [
    ['Astra Hotel Seattle', 265],
    ['citizenM Seattle South Lake Union', 264],
    ['Residence Inn Seattle Downtown Lake Union', 234],
    ['Pan Pacific Seattle', 153],
    ['Moxy Seattle Downtown', 146],
  ]),
  ...hotels('LQA', [
    ['Mediterranean Inn', 180],
    ['Hyatt House Seattle Downtown', 160],
    ['The Maxwell Hotel', 139],
    ['MarQueen Hotel', 59],
  ]),
  ...hotels('CAP', [
    ['Silver Cloud Hotel Seattle Broadway', 179],
    ['Hotel Sorrento', 76],
  ]),
  ...hotels('UDX', [
    ['Silver Cloud Hotel Seattle University District', 180],
    ['Graduate Seattle', 154],
    ['Residence Inn Seattle University District', 150],
    ['Watertown Hotel', 100],
  ]),
  ...hotels('NGT', [
    ['Hotel Nexus Seattle', 169],
    ['Hampton Inn & Suites Seattle Northgate', 125],
  ]),
  ...hotels('FRE', [['Staybridge Suites Seattle Fremont', 120]]),
  ...hotels('BAL', [['Hotel Ballard', 29]]),
  ...hotels('SEA', [
    ['DoubleTree by Hilton Seattle Airport', 850],
    ['Seattle Airport Marriott', 459],
    ['Hilton Seattle Airport & Conference Center', 396],
    ['Crowne Plaza Seattle Airport', 260],
    ['Radisson Hotel Seattle Airport', 204],
    ['Cedarbrook Lodge', 167],
    ['Coast Gateway Hotel', 143],
  ]),
  ...hotels('TUK', [
    ['Embassy Suites Seattle Tacoma International Airport', 238],
    ['DoubleTree Suites Seattle Airport Southcenter', 221],
    ['Courtyard Seattle Southcenter', 211],
    ['Hotel Interurban', 185],
    ['Hampton Inn Seattle Southcenter', 153],
    ['Residence Inn Seattle South Tukwila', 144],
  ]),
  ...hotels('REN', [
    ['Hyatt Regency Lake Washington', 347],
    ['Hampton Inn & Suites Seattle Renton', 110],
  ]),
  ...hotels('BEL', [
    ['Hyatt Regency Bellevue', 732],
    ['Seattle Marriott Bellevue', 384],
    ['Hilton Bellevue', 353],
    ['The Westin Bellevue', 337],
    ['W Bellevue', 245],
    ['AC Hotel Seattle Bellevue Downtown', 234],
    ['InterContinental Bellevue at the Avenue', 208],
  ]),
  ...hotels('KRK', [
    ['Courtyard Seattle Kirkland', 150],
    ['The Woodmark Hotel', 100],
    ['The Heathman Hotel Kirkland', 91],
  ]),
  ...hotels('RDM', [
    ['Seattle Marriott Redmond', 262],
    ['Archer Hotel Redmond', 160],
    ['Hyatt House Seattle Redmond', 150],
  ]),
  ...hotels('FDW', [['Courtyard Seattle Federal Way', 160]]),
];
