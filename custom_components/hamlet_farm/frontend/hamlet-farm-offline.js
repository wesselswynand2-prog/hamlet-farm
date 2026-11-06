/* Hamlet Farm – turn an aerial photo into map tiles in the browser, ready to upload to Home Assistant.

   GeoTIFF (e.g. CD:NGI orthophotos) places itself; a plain JPG / PNG is lined up by hand.
   Tiles are made strip by strip at the photo's own detail, and the zoomed-out levels are built from those,
   so even a big photo is only read once and the phone / PC never holds the whole thing in memory. */
const BASE = new URL(".", import.meta.url).href;
const TILE = 256;
const R = 6378137;

const scripts = {};
function loadScript(name, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scripts[name]) {
    scripts[name] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${BASE}lib/${name}`;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => { delete scripts[name]; reject(new Error(`Could not load ${name}`)); };
      document.head.appendChild(s);
    });
  }
  return scripts[name];
}

/* --------------------------------------------------------------- web-map tile maths */
export const lng2x = (lng, z) => ((lng + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
export const x2lng = (x, z) => (x / 2 ** z) * 360 - 180;
export const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const mercY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Metres per pixel of web-map zoom z at latitude lat. */
const zoomRes = (z, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Best zoom range for a photo with resM metres per pixel over these bounds. */
export function zoomRange(bounds, resM) {
  const lat = (bounds[0][0] + bounds[1][0]) / 2;
  let zmax = Math.round(Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / resM));
  zmax = Math.max(12, Math.min(20, zmax));
  // smallest zoom: the area fits in about one tile, but never more than 7 levels
  const span = Math.max(lng2x(bounds[1][1], zmax) - lng2x(bounds[0][1], zmax), lat2y(bounds[0][0], zmax) - lat2y(bounds[1][0], zmax));
  const zmin = Math.max(zmax - 7, Math.min(zmax, zmax - Math.ceil(Math.log2(Math.max(1, span)))));
  return [Math.max(8, zmin), zmax];
}

export function countTiles(bounds, zmin, zmax) {
  let n = 0;
  for (let z = zmin; z <= zmax; z++) {
    const xs = Math.floor(lng2x(bounds[0][1], z)), xe = Math.floor(lng2x(bounds[1][1], z));
    const ys = Math.floor(lat2y(bounds[1][0], z)), ye = Math.floor(lat2y(bounds[0][0], z));
    n += (xe - xs + 1) * (ye - ys + 1);
  }
  return n;
}

export function intersect(a, b) {
  const s = Math.max(a[0][0], b[0][0]), w = Math.max(a[0][1], b[0][1]), n = Math.min(a[1][0], b[1][0]), e = Math.min(a[1][1], b[1][1]);
  return s < n && w < e ? [[s, w], [n, e]] : null;
}

/* --------------------------------------------------------------- projections */
// GeoTIFF EPSG code -> proj4 definition. CD:NGI uses WGS84 lat/long, Hartebeesthoek94 Lo or UTM.
function projDef(code) {
  if (code === 4326 || code === 4148 || code === 4222) return null;                        // lat / long already
  if (code === 3857 || code === 900913) return "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +no_defs";
  if (code >= 2046 && code <= 2055) {                                                      // Hartebeesthoek94 / Lo15 … Lo33
    return `+proj=tmerc +lat_0=0 +lon_0=${15 + 2 * (code - 2046)} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
  }
  if (code >= 22275 && code <= 22293 && code % 2 === 1) {                                  // Cape / Lo15 … Lo33
    return `+proj=tmerc +lat_0=0 +lon_0=${15 + (code - 22275)} +k=1 +x_0=0 +y_0=0 +a=6378249.145 +rf=293.4663077 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`;
  }
  if ((code >= 32601 && code <= 32660) || (code >= 32701 && code <= 32760)) {
    const zone = code % 100; const south = code > 32700;
    return `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;
  }
  return undefined;   // unknown
}

/* --------------------------------------------------------------- sources */
/** Open a GeoTIFF. Returns a source, or throws with a message the installer can act on. */
export async function openGeoTiff(file) {
  const GeoTIFF = await loadScript("geotiff.js", "GeoTIFF");
  const tiff = await GeoTIFF.fromBlob(file);
  const img = await tiff.getImage();
  const W = img.getWidth(), H = img.getHeight();
  let origin, res;
  try { origin = img.getOrigin(); res = img.getResolution(); } catch (e) { throw new Error("This TIFF has no map position (not a GeoTIFF) – save it as JPG and line it up by hand."); }
  const keys = img.getGeoKeys() || {};
  const code = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || 4326;
  const def = projDef(code);
  if (def === undefined) throw new Error(`The photo uses map projection EPSG:${code}, which the app doesn't know. Export it as WGS84 (EPSG:4326) or line it up by hand as a JPG.`);
  const [ox, oy] = origin; const [rx, ry] = res;
  let p = null;
  if (def) { const proj4 = await loadScript("proj4.js", "proj4"); p = proj4("EPSG:4326", def); }
  // Lo (South African) files are written two ways: easting/northing (GIS software) or westing/southing.
  // Try both and keep the one that comes out north-up and not mirrored.
  const variants = p ? [1, -1] : [1];
  let toPx, corner, c;
  for (const sgn of variants) {
    const fwd = p ? (lng, lat) => { const [x, y] = p.forward([lng, lat]); return [sgn * x, sgn * y]; } : (lng, lat) => [lng, lat];
    const inv = p ? (x, y) => p.inverse([sgn * x, sgn * y]) : (x, y) => [x, y];
    toPx = (lat, lng) => { const [X, Y] = fwd(lng, lat); return [(X - ox) / rx, (Y - oy) / ry]; };
    corner = (px, py) => { const [lng, lat] = inv(ox + px * rx, oy + py * ry); return [lat, lng]; };
    c = [corner(0, 0), corner(W, 0), corner(0, H), corner(W, H)];
    if (c[0][0] > c[2][0] && c[0][1] < c[1][1]) break;
  }
  const lats = c.map((p) => p[0]), lngs = c.map((p) => p[1]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  if (!bounds.flat().every(Number.isFinite) || bounds[0][0] < -90 || bounds[1][0] > 90) throw new Error("Could not work out where this photo is.");
  const latc = (bounds[0][0] + bounds[1][0]) / 2;
  const widthM = ((bounds[1][1] - bounds[0][1]) * Math.PI / 180) * R * Math.cos((latc * Math.PI) / 180);
  const resM = p && code !== 3857 ? Math.abs(rx) : widthM / W;
  const samples = img.getSamplesPerPixel();
  return {
    kind: "geotiff", name: file.name.replace(/\.[^.]+$/, ""), width: W, height: H, bounds, resM, epsg: code, corners: c,
    toPx,
    /** Read a window of the photo at (up to) its own detail, as a canvas. */
    async readBand(x0, y0, x1, y1, maxPx) {
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
      if (x1 <= x0 || y1 <= y0) return null;
      const w = x1 - x0, h = y1 - y0;
      const scale = Math.min(1, Math.sqrt(maxPx / (w * h)));
      const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale));
      let data;
      if (samples >= 3 || img.fileDirectory.PhotometricInterpretation === 3) {
        data = await img.readRGB({ window: [x0, y0, x1, y1], width: ow, height: oh, interleave: true });
      } else {
        const g = await img.readRasters({ window: [x0, y0, x1, y1], width: ow, height: oh, interleave: true, samples: [0] });
        data = new Uint8Array(ow * oh * 3); for (let i = 0; i < ow * oh; i++) data[3 * i] = data[3 * i + 1] = data[3 * i + 2] = g[i];
      }
      const cv = OffscreenCanvasOr(ow, oh); const ctx = cv.getContext("2d");
      const id = ctx.createImageData(ow, oh); const d = id.data;
      const step = data.length / (ow * oh);
      for (let i = 0, j = 0; i < ow * oh; i++, j += step) {
        const r = data[j], g = data[j + 1], b = data[j + 2];
        d[4 * i] = r; d[4 * i + 1] = g; d[4 * i + 2] = b;
        d[4 * i + 3] = r + g + b === 0 || r + g + b === 765 ? 0 : 255;   // pure black / white border = no photo
      }
      ctx.putImageData(id, 0, 0);
      return { canvas: cv, ox: x0, oy: y0, sx: ow / w, sy: oh / h };
    },
  };
}

/** A plain JPG / PNG. Its corners are set by hand (bounds), and it is treated as a north-up web-map picture. */
export async function openImage(file) {
  const bmp = await createImageBitmap(file);
  return {
    kind: "image", name: file.name.replace(/\.[^.]+$/, ""), width: bmp.width, height: bmp.height, bitmap: bmp, bounds: null, resM: null,
    url: URL.createObjectURL(file),
    setBounds(b) {
      this.bounds = b;
      const latc = (b[0][0] + b[1][0]) / 2;
      this.resM = (((b[1][1] - b[0][1]) * Math.PI / 180) * R * Math.cos((latc * Math.PI) / 180)) / this.width;
      const top = mercY(b[1][0]), bot = mercY(b[0][0]);
      this.toPx = (lat, lng) => [((lng - b[0][1]) / (b[1][1] - b[0][1])) * this.width, ((top - mercY(lat)) / (top - bot)) * this.height];
    },
    async readBand(x0, y0, x1, y1) {
      if (x1 <= 0 || y1 <= 0 || x0 >= this.width || y0 >= this.height) return null;
      return { canvas: this.bitmap, ox: 0, oy: 0, sx: 1, sy: 1 };
    },
  };
}

// OffscreenCanvas where there is one (faster, no DOM), else a normal canvas
function OffscreenCanvasOr(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

async function encode(canvas, full) {
  const type = full ? "image/jpeg" : "image/png";
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type, quality: 0.82 }) : await new Promise((r) => canvas.toBlob(r, type, 0.82));
  return { blob, ext: full ? "jpg" : "png" };
}

/**
 * Cut `src` into web-map tiles over `area` for zooms zmin..zmax.
 * onTile(z, x, y, blob, ext) is awaited for every tile (upload it there). onProgress(fraction 0..1, tiles so far).
 * Returns the number of tiles made.
 */
export async function makeTiles(src, area, zmin, zmax, { onTile, onProgress, signal } = {}) {
  let done = 0;
  const tick = () => { done++; };
  const pending = {};   // z -> parentY -> { rows: { y: Map(x -> {canvas, full}) } }

  // a whole row of tiles at zoom z is ready: save them and feed the zoomed-out level
  const emitRow = async (z, y, row, last) => {
    for (const [x, t] of row) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const { blob, ext } = await encode(t.canvas, t.full);
      await onTile(z, x, y, blob, ext);
      tick();
    }
    if (z <= zmin) return;
    const py = y >> 1;
    const p = (pending[z] = pending[z] || {});
    (p[py] = p[py] || {})[y] = row;
    if ((y & 1) === 1 || last) {   // rows arrive top to bottom: an odd row is the second (last) child of its parent
      const parts = p[py]; delete p[py];
      const parent = new Map();
      const kids = {};
      for (const cy of Object.keys(parts).map(Number)) {
        for (const [cx, t] of parts[cy]) {
          const px = cx >> 1;
          if (!kids[px]) kids[px] = [];
          kids[px].push({ cx, cy, t });
        }
      }
      for (const px of Object.keys(kids).map(Number).sort((a, b) => a - b)) {
        const cv = OffscreenCanvasOr(TILE, TILE); const ctx = cv.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        let full = kids[px].length === 4;
        for (const { cx, cy, t } of kids[px]) {
          ctx.drawImage(t.canvas, (cx & 1) * 128, (cy & 1) * 128, 128, 128);
          full = full && t.full;
        }
        parent.set(px, { canvas: cv, full });
      }
      await emitRow(z - 1, py, parent, last);
    }
  };

  // zmax: read the photo one row of tiles at a time
  const z = zmax;
  const xs = Math.floor(lng2x(area[0][1], z)), xe = Math.floor(lng2x(area[1][1], z));
  const ys = Math.floor(lat2y(area[1][0], z)), ye = Math.floor(lat2y(area[0][0], z));
  onProgress && onProgress(0, 0);
  for (let y = ys; y <= ye; y++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const corners = [];
    for (const lat of [y2lat(y, z), y2lat(y + 1, z)]) for (const lng of [x2lng(xs, z), x2lng(xe + 1, z), x2lng((xs + xe + 1) / 2, z)]) corners.push(src.toPx(lat, lng));
    const px = corners.map((c) => c[0]), py = corners.map((c) => c[1]);
    const band = await src.readBand(Math.min(...px) - 2, Math.min(...py) - 2, Math.max(...px) + 2, Math.max(...py) + 2, 12e6);
    const row = new Map();
    if (band) {
      for (let x = xs; x <= xe; x++) {
        const nw = src.toPx(y2lat(y, z), x2lng(x, z)), ne = src.toPx(y2lat(y, z), x2lng(x + 1, z)), sw = src.toPx(y2lat(y + 1, z), x2lng(x, z));
        const se = src.toPx(y2lat(y + 1, z), x2lng(x + 1, z));
        const inside = (p) => p[0] >= 0 && p[1] >= 0 && p[0] <= src.width && p[1] <= src.height;
        const anyIn = [nw, ne, sw, se].some(inside) || (Math.min(nw[0], sw[0]) < src.width && Math.max(ne[0], se[0]) > 0 && Math.min(nw[1], ne[1]) < src.height && Math.max(sw[1], se[1]) > 0);
        if (!anyIn) continue;
        // band pixel coords of 3 corners -> affine transform onto the 256 px tile
        const b = (p) => [(p[0] - band.ox) * band.sx, (p[1] - band.oy) * band.sy];
        const s0 = b(nw), s1 = b(ne), s2 = b(sw);
        const a = (s1[0] - s0[0]) / TILE, c = (s2[0] - s0[0]) / TILE, bb = (s1[1] - s0[1]) / TILE, d = (s2[1] - s0[1]) / TILE;
        const det = a * d - bb * c; if (!det) continue;
        // inverse: band -> tile
        const ia = d / det, ib = -bb / det, ic = -c / det, id = a / det;
        const ie = -(ia * s0[0] + ic * s0[1]), iff = -(ib * s0[0] + id * s0[1]);
        const cv = OffscreenCanvasOr(TILE, TILE); const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingQuality = "high";
        ctx.setTransform(ia, ib, ic, id, ie, iff);
        ctx.drawImage(band.canvas, 0, 0);
        const full = [nw, ne, sw, se].every(inside) && (src.kind === "image" || !hasGap(ctx));
        row.set(x, { canvas: cv, full });
      }
    }
    await emitRow(z, y, row, y === ye);
    onProgress && onProgress((y - ys + 1) / (ye - ys + 1), done);
    await new Promise((r) => setTimeout(r, 0));   // keep the page responsive
  }
  return done;
}

// a tile with transparent (no-photo) corners must stay PNG
function hasGap(ctx) {
  for (const [x, y] of [[0, 0], [TILE - 1, 0], [0, TILE - 1], [TILE - 1, TILE - 1], [128, 128]]) if (ctx.getImageData(x, y, 1, 1).data[3] < 255) return true;
  return false;
}
