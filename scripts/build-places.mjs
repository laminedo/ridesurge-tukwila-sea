// Builds the bundled gazetteer of US places from the `all-the-cities` dataset (GeoNames, population >= 5,000).
// Run with `npm run places` after updating the dataset. Rows are [name, state, lat, lng, population in thousands].
import { writeFile } from 'node:fs/promises';
import cities from 'all-the-cities';

const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '),
);

const rows = cities
  .filter((c) => c.country === 'US' && STATES.has(c.adminCode) && c.population >= 5000)
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name, c.adminCode, +c.loc.coordinates[1].toFixed(4), +c.loc.coordinates[0].toFixed(4), Math.round(c.population / 1000)]);

await writeFile('src/data/us-places.json', JSON.stringify(rows));
console.log(`${rows.length} places written to src/data/us-places.json`);
