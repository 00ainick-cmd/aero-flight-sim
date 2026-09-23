// Segment bits: a b c d e f g
const MAP: Record<string, number> = {
  '0': 0b1111110, '1': 0b0110000, '2': 0b1101101, '3': 0b1111001, '4': 0b0110011,
  '5': 0b1011011, '6': 0b1011111, '7': 0b1110000, '8': 0b1111111, '9': 0b1111011,
  '-': 0b0000001, ' ': 0, '_': 0b0001000,
  A: 0b1110111, b: 0b0011111, C: 0b1001110, c: 0b0001101, d: 0b0111101, E: 0b1001111,
  F: 0b1000111, h: 0b0010111, i: 0b0010000, L: 0b0001110, n: 0b0010101, o: 0b0011101,
  P: 0b1100111, r: 0b0000101, t: 0b0001111, U: 0b0111110, u: 0b0011100, '°': 0b1100011,
};

const W = 26;
const H = 46;
const T = 5;

function segPolys(x: number): string[] {
  const hw = W - 4;
  const hh = (H - 6) / 2;
  const x0 = x + 2;
  const s = (pts: [number, number][]) => pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const horiz = (y: number) => s([[x0 + T / 2, y], [x0 + T, y - T / 2], [x0 + hw - T, y - T / 2], [x0 + hw - T / 2, y], [x0 + hw - T, y + T / 2], [x0 + T, y + T / 2]]);
  const vert = (vx: number, y1: number, y2: number) => s([[vx, y1 + T / 2], [vx + T / 2, y1 + T], [vx + T / 2, y2 - T], [vx, y2 - T / 2], [vx - T / 2, y2 - T], [vx - T / 2, y1 + T]]);
  const top = 3;
  const mid = top + hh;
  const bot = top + hh * 2;
  return [
    horiz(top),
    vert(x0 + hw, top, mid),
    vert(x0 + hw, mid, bot),
    horiz(bot),
    vert(x0, mid, bot),
    vert(x0, top, mid),
    horiz(mid),
  ];
}

/**
 * Renders a string into a skewed 7-segment SVG. ':' and '.' attach to the preceding digit cell.
 */
export function sevenSegSvg(text: string, cells: number): string {
  const chars: { c: string; dot: boolean; colon: boolean }[] = [];
  for (const ch of text) {
    if (ch === '.' && chars.length) chars[chars.length - 1].dot = true;
    else if (ch === ':' && chars.length) chars[chars.length - 1].colon = true;
    else chars.push({ c: ch, dot: false, colon: false });
  }
  while (chars.length < cells) chars.unshift({ c: ' ', dot: false, colon: false });
  const gap = 13;
  let out = '';
  chars.slice(-cells).forEach((d, i) => {
    const x = i * (W + gap);
    const bits = MAP[d.c] ?? 0;
    segPolys(x).forEach((p, si) => {
      const on = (bits >> (6 - si)) & 1;
      out += `<polygon points="${p}" class="${on ? 'on' : 'off'}"/>`;
    });
    out += `<circle cx="${x + W + 2.5}" cy="${H - 3}" r="2.6" class="${d.dot ? 'on' : 'off'}"/>`;
    if (i % 2 === 1 && i < cells - 1) {
      const cx = x + W + gap / 2 + 1;
      out += `<circle cx="${cx + 1.2}" cy="${H * 0.32}" r="2.6" class="${d.colon ? 'on' : 'off'}"/><circle cx="${cx - 1.2}" cy="${H * 0.68}" r="2.6" class="${d.colon ? 'on' : 'off'}"/>`;
    }
  });
  const total = cells * (W + gap);
  return `<svg viewBox="-4 0 ${total + 4} ${H}" preserveAspectRatio="xMidYMid meet"><g transform="skewX(-6)">${out}</g></svg>`;
}
