// 全国踏破帖の地図データ（MAP）を作るスクリプト
// 使い方:
//   1. Natural Earth の ne_10m_admin_1_states_provinces.geojson から日本（adm0_a3 = JPN）を取り出し、
//      properties に code（"01"〜"47"）を持たせた jp.json を作る
//   2. npx mapshaper jp.json -filter-islands min-area=30km2 -simplify 18% keep-shapes -o precision=0.0001 jp-s.json
//      npx mapshaper jp-s.json -points inner -o jp-pts.json
//   3. node build-map.js jp-s.json jp-pts.json map.json → map.json の中身を index.html の const MAP に貼る
// GeoJSON -> SVG path data. 南西諸島（沖縄県と北緯29.5度以南の鹿児島県）は九州の右下の枠へ、東京の離島（北緯34.5度以南）は省く
const fs = require('fs');
const [,, shapesFile, ptsFile, out] = process.argv;
const shapes = JSON.parse(fs.readFileSync(shapesFile, 'utf8'));
const pts = JSON.parse(fs.readFileSync(ptsFile, 'utf8'));
const K = Math.cos(36 * Math.PI / 180);
const S = 40; // 1度あたりの単位
const proj = ([lon, lat]) => [(lon - 128) * K * S, (46 - lat) * S];
// 南西諸島の枠：元の範囲 lon 122.9-131.4, lat 24.0-29.6 を縮小して右下へ
const INSET = { scale: 0.66, src: [122.8, 28.9], dst: [131.95, 32.3] };
const projInset = ([lon, lat]) => {
  const [x0, y0] = proj(INSET.src), [x1, y1] = proj(INSET.dst);
  const [x, y] = proj([lon, lat]);
  return [x1 + (x - x0) * INSET.scale, y1 + (y - y0) * INSET.scale];
};
const isSouthwest = (code, ring) => code === '47' || (code === '46' && ring.every(([, lat]) => lat < 29.5));
const dropRing = (code, ring) => code === '13' && ring.every(([, lat]) => lat < 34.5);
const r = (n) => Math.round(n * 10) / 10;
const paths = {};
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const bbox = {};
for (const f of shapes.features) {
  const code = f.properties.code;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = '';
  const b = bbox[code] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) {
    if (dropRing(code, poly[0])) continue;
    const p = isSouthwest(code, poly[0]) ? projInset : proj;
    for (const ring of poly) {
      let prev = null, seg = '';
      for (const c of ring) {
        const [x, y] = p(c).map(r);
        if (prev && prev[0] === x && prev[1] === y) continue;
        seg += (seg ? 'L' : 'M') + x + ' ' + y;
        prev = [x, y];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (p === proj) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
      }
      d += seg + 'Z';
    }
  }
  if (b[0] === Infinity) bbox[code] = null;
  paths[code] = d.replace(/L/g, 'L').replace(/ -/g, '-');
}
const labels = {};
for (const f of pts.features) {
  const code = f.properties.code;
  const c = f.geometry.coordinates;
  const p = (code === '47') ? projInset : proj;
  labels[code] = p(c).map(r);
}
const pad = 6;
const data = { viewBox: [r(minX - pad), r(minY - pad), r(maxX - minX + 2 * pad), r(maxY - minY + 2 * pad)], inset: (() => {
  const [x0, y0] = projInset([122.8, 28.9]), [x1, y1] = projInset([130.4, 23.9]);
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
})(), paths, labels, bbox };
fs.writeFileSync(out, JSON.stringify(data));
console.log('viewBox', data.viewBox, 'inset', data.inset, 'bytes', JSON.stringify(data).length);
