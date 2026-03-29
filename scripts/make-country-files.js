import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, '..', 'data', 'world-countries.geojson');
console.log('Reading from', inputPath);
const raw = fs.readFileSync(inputPath, 'utf8');
const world = JSON.parse(raw);

const wanted = ['CA', 'GB', 'NO', 'IN', 'CN', 'QA', 'JP', 'AU', 'CH'];
const outDir = path.join(__dirname, '..', 'public', 'geojson');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

wanted.forEach(code => {
  const feature = world.features.find(
    f => f.properties.ISO_A2 === code || f.properties.ISO_A2_EH === code
  );
  if (!feature) {
    console.warn('No feature for', code);
    return;
  }

  const fc = { type: 'FeatureCollection', features: [feature] };
  const outPath = path.join(outDir, `${code.toLowerCase()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fc));
  console.log('Wrote', outPath);
});
