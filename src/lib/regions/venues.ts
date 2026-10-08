/**
 * Major-league stadiums and arenas outside Seattle, so any metro gets real
 * home-game dismissals. Coordinates are approximate (good to a few blocks) and
 * only decide which zone a venue belongs to; navigation uses the venue name.
 * The schedule drawn from this table is simulated.
 */
export type League = 'NFL' | 'MLB' | 'NBA' | 'NHL' | 'MLS';

export interface VenueDef {
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  /** Home teams by league. */
  teams: Partial<Record<League, string>>;
}

const v = (name: string, lat: number, lng: number, capacity: number, teams: VenueDef['teams']): VenueDef => ({
  name, lat, lng, capacity, teams,
});

export const VENUES: readonly VenueDef[] = [
  // Football stadiums
  v('AT&T Stadium', 32.748, -97.093, 80000, { NFL: 'Cowboys' }),
  v('SoFi Stadium', 33.953, -118.339, 70000, { NFL: 'Rams or Chargers' }),
  v('MetLife Stadium', 40.813, -74.074, 82500, { NFL: 'Giants or Jets' }),
  v('Soldier Field', 41.862, -87.617, 61500, { NFL: 'Bears', MLS: 'Fire FC' }),
  v('Lambeau Field', 44.501, -88.062, 81400, { NFL: 'Packers' }),
  v('Gillette Stadium', 42.091, -71.264, 65900, { NFL: 'Patriots', MLS: 'Revolution' }),
  v('Lincoln Financial Field', 39.901, -75.168, 69800, { NFL: 'Eagles' }),
  v('Northwest Stadium', 38.908, -76.864, 62000, { NFL: 'Commanders' }),
  v('M&T Bank Stadium', 39.278, -76.623, 71000, { NFL: 'Ravens' }),
  v('Acrisure Stadium', 40.447, -80.016, 68400, { NFL: 'Steelers' }),
  v('Huntington Bank Field', 41.506, -81.699, 67400, { NFL: 'Browns' }),
  v('Paycor Stadium', 39.095, -84.516, 65500, { NFL: 'Bengals' }),
  v('Highmark Stadium', 42.774, -78.787, 71600, { NFL: 'Bills' }),
  v('Hard Rock Stadium', 25.958, -80.239, 65300, { NFL: 'Dolphins' }),
  v('Raymond James Stadium', 27.976, -82.503, 65600, { NFL: 'Buccaneers' }),
  v('EverBank Stadium', 30.324, -81.637, 67800, { NFL: 'Jaguars' }),
  v('Mercedes-Benz Stadium', 33.755, -84.401, 71000, { NFL: 'Falcons', MLS: 'Atlanta United' }),
  v('Bank of America Stadium', 35.226, -80.853, 74800, { NFL: 'Panthers', MLS: 'Charlotte FC' }),
  v('Caesars Superdome', 29.951, -90.081, 73200, { NFL: 'Saints' }),
  v('Nissan Stadium', 36.166, -86.771, 69100, { NFL: 'Titans' }),
  v('Lucas Oil Stadium', 39.76, -86.164, 67000, { NFL: 'Colts' }),
  v('NRG Stadium', 29.685, -95.411, 72200, { NFL: 'Texans' }),
  v('Arrowhead Stadium', 39.049, -94.484, 76400, { NFL: 'Chiefs' }),
  v('Empower Field at Mile High', 39.744, -105.02, 76100, { NFL: 'Broncos' }),
  v('Allegiant Stadium', 36.091, -115.184, 65000, { NFL: 'Raiders' }),
  v('State Farm Stadium', 33.528, -112.263, 63400, { NFL: 'Cardinals' }),
  v("Levi's Stadium", 37.403, -121.97, 68500, { NFL: '49ers' }),
  v('U.S. Bank Stadium', 44.974, -93.258, 66900, { NFL: 'Vikings' }),
  v('Ford Field', 42.34, -83.046, 65000, { NFL: 'Lions' }),

  // Ballparks
  v('Yankee Stadium', 40.829, -73.926, 46500, { MLB: 'Yankees' }),
  v('Citi Field', 40.757, -73.846, 41900, { MLB: 'Mets' }),
  v('Fenway Park', 42.347, -71.097, 37700, { MLB: 'Red Sox' }),
  v('Citizens Bank Park', 39.906, -75.166, 42900, { MLB: 'Phillies' }),
  v('Nationals Park', 38.873, -77.007, 41300, { MLB: 'Nationals' }),
  v('Oriole Park at Camden Yards', 39.284, -76.622, 45000, { MLB: 'Orioles' }),
  v('PNC Park', 40.447, -80.006, 38700, { MLB: 'Pirates' }),
  v('Progressive Field', 41.496, -81.685, 34800, { MLB: 'Guardians' }),
  v('Great American Ball Park', 39.097, -84.507, 43500, { MLB: 'Reds' }),
  v('Comerica Park', 42.339, -83.049, 41000, { MLB: 'Tigers' }),
  v('Wrigley Field', 41.948, -87.656, 41600, { MLB: 'Cubs' }),
  v('Rate Field', 41.83, -87.634, 40600, { MLB: 'White Sox' }),
  v('American Family Field', 43.028, -87.971, 41900, { MLB: 'Brewers' }),
  v('Target Field', 44.982, -93.278, 38500, { MLB: 'Twins' }),
  v('Busch Stadium', 38.623, -90.193, 44400, { MLB: 'Cardinals' }),
  v('Kauffman Stadium', 39.051, -94.48, 37900, { MLB: 'Royals' }),
  v('Globe Life Field', 32.747, -97.084, 40300, { MLB: 'Rangers' }),
  v('Daikin Park', 29.757, -95.355, 41200, { MLB: 'Astros' }),
  v('Truist Park', 33.891, -84.468, 41000, { MLB: 'Braves' }),
  v('loanDepot park', 25.778, -80.22, 37400, { MLB: 'Marlins' }),
  v('Coors Field', 39.756, -104.994, 50100, { MLB: 'Rockies' }),
  v('Chase Field', 33.445, -112.067, 48400, { MLB: 'Diamondbacks' }),
  v('Dodger Stadium', 34.074, -118.24, 56000, { MLB: 'Dodgers' }),
  v('Angel Stadium', 33.8, -117.883, 45500, { MLB: 'Angels' }),
  v('Petco Park', 32.707, -117.157, 40200, { MLB: 'Padres' }),
  v('Oracle Park', 37.778, -122.389, 41900, { MLB: 'Giants' }),

  // Arenas
  v('Madison Square Garden', 40.7505, -73.9934, 19800, { NBA: 'Knicks', NHL: 'Rangers' }),
  v('Barclays Center', 40.6826, -73.9754, 17700, { NBA: 'Nets' }),
  v('UBS Arena', 40.712, -73.726, 17250, { NHL: 'Islanders' }),
  v('Prudential Center', 40.7335, -74.171, 16500, { NHL: 'Devils' }),
  v('TD Garden', 42.366, -71.062, 19000, { NBA: 'Celtics', NHL: 'Bruins' }),
  v('Xfinity Mobile Arena', 39.901, -75.172, 20000, { NBA: '76ers', NHL: 'Flyers' }),
  v('Capital One Arena', 38.898, -77.021, 20000, { NBA: 'Wizards', NHL: 'Capitals' }),
  v('PPG Paints Arena', 40.439, -79.989, 18400, { NHL: 'Penguins' }),
  v('Rocket Arena', 41.4965, -81.688, 19400, { NBA: 'Cavaliers' }),
  v('Little Caesars Arena', 42.341, -83.055, 20000, { NBA: 'Pistons', NHL: 'Red Wings' }),
  v('United Center', 41.8807, -87.6742, 20900, { NBA: 'Bulls', NHL: 'Blackhawks' }),
  v('Fiserv Forum', 43.045, -87.917, 17300, { NBA: 'Bucks' }),
  v('Target Center', 44.9795, -93.276, 18800, { NBA: 'Timberwolves' }),
  v('Grand Casino Arena', 44.945, -93.101, 18000, { NHL: 'Wild' }),
  v('Gainbridge Fieldhouse', 39.764, -86.1555, 17300, { NBA: 'Pacers' }),
  v('Nationwide Arena', 39.969, -83.006, 18100, { NHL: 'Blue Jackets' }),
  v('KeyBank Center', 42.875, -78.876, 19000, { NHL: 'Sabres' }),
  v('Spectrum Center', 35.225, -80.839, 19000, { NBA: 'Hornets' }),
  v('Lenovo Center', 35.803, -78.722, 18700, { NHL: 'Hurricanes' }),
  v('State Farm Arena', 33.757, -84.396, 16600, { NBA: 'Hawks' }),
  v('Kia Center', 28.539, -81.384, 18800, { NBA: 'Magic' }),
  v('Kaseya Center', 25.781, -80.188, 19600, { NBA: 'Heat' }),
  v('Amerant Bank Arena', 26.158, -80.325, 19250, { NHL: 'Panthers' }),
  v('Amalie Arena', 27.943, -82.452, 19000, { NHL: 'Lightning' }),
  v('Bridgestone Arena', 36.159, -86.778, 17100, { NHL: 'Predators' }),
  v('FedExForum', 35.138, -90.051, 17800, { NBA: 'Grizzlies' }),
  v('Smoothie King Center', 29.949, -90.082, 16900, { NBA: 'Pelicans' }),
  v('Toyota Center', 29.751, -95.362, 18000, { NBA: 'Rockets' }),
  v('American Airlines Center', 32.7905, -96.8103, 19200, { NBA: 'Mavericks', NHL: 'Stars' }),
  v('Frost Bank Center', 29.427, -98.4375, 18400, { NBA: 'Spurs' }),
  v('Paycom Center', 35.463, -97.515, 18200, { NBA: 'Thunder' }),
  v('Enterprise Center', 38.627, -90.203, 18100, { NHL: 'Blues' }),
  v('T-Mobile Center', 39.097, -94.58, 18000, {}),
  v('Ball Arena', 39.749, -105.008, 19500, { NBA: 'Nuggets', NHL: 'Avalanche' }),
  v('Delta Center', 40.768, -111.901, 18200, { NBA: 'Jazz', NHL: 'Mammoth' }),
  v('PHX Arena', 33.446, -112.071, 17000, { NBA: 'Suns' }),
  v('T-Mobile Arena', 36.103, -115.178, 17500, { NHL: 'Golden Knights' }),
  v('Crypto.com Arena', 34.043, -118.267, 19000, { NBA: 'Lakers', NHL: 'Kings' }),
  v('Intuit Dome', 33.945, -118.343, 18000, { NBA: 'Clippers' }),
  v('Honda Center', 33.808, -117.877, 17200, { NHL: 'Ducks' }),
  v('Chase Center', 37.768, -122.388, 18100, { NBA: 'Warriors' }),
  v('SAP Center', 37.333, -121.901, 17500, { NHL: 'Sharks' }),
  v('Golden 1 Center', 38.58, -121.4995, 17600, { NBA: 'Kings' }),
  v('Moda Center', 45.5316, -122.6668, 19400, { NBA: 'Trail Blazers' }),
];
