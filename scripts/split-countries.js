import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const inputPath = join(__dirname, '..', 'data', 'world-countries.geojson');
const raw = readFileSync(inputPath, 'utf8');
const world = JSON.parse(raw);

const wanted = ['CA', 'GB', 'NO', 'IN', 'CN', 'QA', 'JP', 'AU', 'CH'];
const outDir = join(__dirname, '..', 'public', 'geojson');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

wanted.forEach(code => {
  const feature = world.features.find(
    f => f.properties.ISO_A2 === code || f.properties.ISO_A2_EH === code
  );
  if (!feature) {
    console.warn('No feature for', code);
    return;
  }

  const fc = { type: 'FeatureCollection', features: [feature] };
  const outPath = join(outDir, `${code.toLowerCase()}.json`);
  writeFileSync(outPath, JSON.stringify(fc));
  console.log('Wrote', outPath);
});
