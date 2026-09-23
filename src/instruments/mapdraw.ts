import { AIRPORTS, NAVAIDS } from '../sim/navdata';
import { toLocalNm } from '../sim/geo';

export interface MapOpts {
  lat: number;
  lon: number;
  trk: number;
  rangeNm: number;
  trackUp: boolean;
  dto: { lat: number; lon: number; oLat: number; oLon: number; ident: string } | null;
  valid: boolean;
  style: 'garmin' | 'dynon';
}

export function fitCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const hgt = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function drawMap(ctx: CanvasRenderingContext2D, w: number, hgt: number, o: MapOpts) {
  const dyn = o.style === 'dynon';
  ctx.fillStyle = dyn ? '#1d3b1c' : '#0a1426';
  ctx.fillRect(0, 0, w, hgt);

  const cx = w / 2;
  const cy = dyn ? hgt / 2 : hgt * 0.62;
  const ppn = (Math.min(w, hgt) * 0.45) / o.rangeNm;
  const rot = o.trackUp ? (o.trk * Math.PI) / 180 : 0;

  // terrain-ish texture
  if (dyn) {
    const g = ctx.createRadialGradient(cx - w * 0.2, cy - hgt * 0.2, 10, cx, cy, w * 0.8);
    g.addColorStop(0, '#3c5b2a');
    g.addColorStop(0.6, '#2c4a22');
    g.addColorStop(1, '#233c1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
  }

  const project = (lat: number, lon: number): [number, number] => {
    const [x, y] = toLocalNm(o.lat, o.lon, lat, lon);
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [cx + rx * ppn, cy - ry * ppn];
  };

  if (!o.valid) {
    ctx.fillStyle = dyn ? '#2a2a2a' : '#0a1426';
    ctx.fillRect(0, 0, w, hgt);
  }

  // range ring
  ctx.strokeStyle = dyn ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, (o.rangeNm / 2) * ppn, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 10px "Roboto Condensed", sans-serif';
  ctx.fillText(`${o.rangeNm / 2}`, cx + (o.rangeNm / 2) * ppn * 0.7 + 3, cy - (o.rangeNm / 2) * ppn * 0.7);

  if (o.valid) {
    if (o.dto) {
      const [ax, ay] = project(o.dto.oLat, o.dto.oLon);
      const [bx, by] = project(o.dto.lat, o.dto.lon);
      ctx.strokeStyle = '#ff38ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    for (const n of NAVAIDS) {
      const [x, y] = project(n.lat, n.lon);
      if (x < -20 || y < -20 || x > w + 20 || y > hgt + 20) continue;
      ctx.strokeStyle = dyn ? '#9ad7ff' : '#5ec8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * 6;
        const py = y + Math.sin(a) * 6;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = dyn ? '#cfefff' : '#9fdcff';
      ctx.font = '600 10px "Roboto Condensed", sans-serif';
      ctx.fillText(n.ident, x + 8, y + 4);
    }

    for (const a of AIRPORTS) {
      const [x, y] = project(a.lat, a.lon);
      if (x < -30 || y < -30 || x > w + 30 || y > hgt + 30) continue;
      ctx.fillStyle = dyn ? '#d8a0ff' : '#35a7ff';
      ctx.strokeStyle = dyn ? '#d8a0ff' : '#35a7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 3); ctx.lineTo(x + 7, y + 3);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px "Roboto Condensed", sans-serif';
      ctx.fillText(a.ident, x + 9, y - 6);
    }
  }

  // ownship
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.trackUp ? 0 : (o.trk * Math.PI) / 180);
  if (o.valid) {
    ctx.fillStyle = dyn ? '#fff' : '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(3, -2); ctx.lineTo(11, 2); ctx.lineTo(11, 4); ctx.lineTo(3, 3);
    ctx.lineTo(2, 8); ctx.lineTo(5, 10); ctx.lineTo(5, 11); ctx.lineTo(0, 10);
    ctx.lineTo(-5, 11); ctx.lineTo(-5, 10); ctx.lineTo(-2, 8); ctx.lineTo(-3, 3);
    ctx.lineTo(-11, 4); ctx.lineTo(-11, 2); ctx.lineTo(-3, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  if (!o.valid) {
    ctx.fillStyle = dyn ? '#ffd400' : '#ffd400';
    ctx.font = '700 22px "Roboto Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', cx, cy + 8);
    ctx.font = '600 12px "Roboto Condensed", sans-serif';
    ctx.fillText(dyn ? 'NO GPS POSITION' : 'No GPS Position', cx, cy + 28);
    ctx.textAlign = 'left';
  }

  // orientation label
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(4, 4, 56, 16);
  ctx.fillStyle = '#fff';
  ctx.font = '600 10px "Roboto Condensed", sans-serif';
  ctx.fillText(o.trackUp ? 'TRACK UP' : 'NORTH UP', 8, 16);
}
