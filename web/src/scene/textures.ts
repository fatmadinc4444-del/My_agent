import * as THREE from 'three';
import { rng } from '../math/noise';

/** Canvas-generated textures (no binary assets to ship). */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Retro space-movie style poster (original art, no trademarks). */
export function posterTexture(kind: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 384);
  const R = rng(100 + kind);
  const palettes = [
    ['#1d1b4b', '#e94f37', '#f6c85f', '#f0e6d2'],
    ['#0f3b46', '#f2a541', '#e4572e', '#f3f1e9'],
    ['#2b1e3f', '#7bdff2', '#f7aef8', '#fdf7ff'],
    ['#3a2618', '#d9a441', '#7aa874', '#efe6d5'],
  ];
  const [bg, a, b, txt] = palettes[kind % palettes.length];
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 384);
  if (kind % 4 === 0) {
    // planet + rings
    const gr = g.createRadialGradient(110, 150, 10, 128, 170, 90);
    gr.addColorStop(0, b);
    gr.addColorStop(1, a);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 170, 80, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = txt;
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(128, 175, 125, 26, -0.25, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${R() * 0.8})`;
      g.fillRect(R() * 256, R() * 384, 2, 2);
    }
  } else if (kind % 4 === 1) {
    // mountains & sun
    g.fillStyle = b;
    g.beginPath();
    g.arc(128, 150, 60, 0, Math.PI * 2);
    g.fill();
    for (let l = 0; l < 3; l++) {
      g.fillStyle = l === 0 ? a : l === 1 ? '#c2412b' : '#2a1a14';
      g.beginPath();
      g.moveTo(0, 384);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, 200 + l * 40 + Math.sin(x * 0.03 + l * 2) * 30 + R() * 10);
      g.lineTo(256, 384);
      g.fill();
    }
  } else if (kind % 4 === 2) {
    // robot head
    g.fillStyle = a;
    g.fillRect(68, 90, 120, 110);
    g.fillStyle = b;
    g.beginPath();
    g.arc(103, 140, 18, 0, Math.PI * 2);
    g.arc(153, 140, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.fillRect(98, 175, 60, 10);
    g.fillStyle = txt;
    g.fillRect(125, 60, 6, 30);
  } else {
    // guitar silhouette
    g.fillStyle = a;
    g.beginPath();
    g.ellipse(128, 250, 60, 70, 0, 0, Math.PI * 2);
    g.ellipse(128, 170, 45, 50, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(128, 215, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = b;
    g.fillRect(120, 30, 16, 150);
  }
  g.fillStyle = txt;
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  const titles = ['KOZMOS', 'ZİRVE', 'ROBO-7', 'AKOR'];
  g.fillText(titles[kind % 4], 128, 345);
  g.font = '12px sans-serif';
  g.fillText('bir gece hikayesi', 128, 365);
  return tex(c);
}

/** Wood planks albedo + roughness variation baked in alpha-free RGB. */
export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const R = rng(7);
  const planks = 6;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * 512) / planks;
    const base = 0.75 + R() * 0.25;
    for (let x = 0; x < 512; x += 2) {
      for (let y = 0; y < 512 / planks; y += 2) {
        const grain = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(y * 0.15 + p) * 2.5 + p * 10);
        const n = (R() - 0.5) * 0.06;
        const k = base * (0.82 + 0.18 * grain) + n;
        g.fillStyle = `rgb(${Math.round(120 * k)},${Math.round(78 * k)},${Math.round(50 * k)})`;
        g.fillRect(x, y0 + y, 2, 2);
      }
    }
    g.fillStyle = 'rgba(30,18,10,0.8)';
    g.fillRect(0, y0, 512, 2);
    const cut = R() * 512;
    g.fillRect(cut, y0, 2, 512 / planks);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Laptop screen: a friendly chat UI. */
export function laptopScreen(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 320);
  g.fillStyle = '#16152b';
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#26244a';
  g.fillRect(0, 0, 512, 34);
  g.fillStyle = '#8f8cff';
  g.font = 'bold 18px sans-serif';
  g.fillText('Konuşma Pratiği', 16, 23);
  const bubbles = [
    [24, 60, 280, '#2f2d5c', 'Bugün nasıl geçti?'],
    [210, 110, 280, '#5b54d6', 'Harika, gitar çaldım!'],
    [24, 160, 300, '#2f2d5c', 'Süper! Hangi şarkıyı?'],
    [240, 210, 250, '#5b54d6', 'Kendi bestem :)'],
  ] as const;
  for (const [x, y, w, col, text] of bubbles) {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x, y, w, 36, 12);
    g.fill();
    g.fillStyle = '#ecebff';
    g.font = '16px sans-serif';
    g.fillText(text, x + 14, y + 24);
  }
  g.fillStyle = '#26244a';
  g.fillRect(16, 270, 480, 34);
  return tex(c);
}

export function phoneScreen(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3b2f8f');
  gr.addColorStop(1, '#c0569b');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.fillText('22:47', 64, 60);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.roundRect(12, 100 + i * 42, 104, 32, 8);
    g.fill();
  }
  return tex(c);
}

export function bookSpineColors(n: number): THREE.Color[] {
  const R = rng(3);
  const pal = ['#8c3b3b', '#2f5d7c', '#d1a54a', '#476b44', '#6a4c93', '#c8643b', '#e7d7b0', '#2b2b38'];
  return Array.from({ length: n }, () => new THREE.Color(pal[Math.floor(R() * pal.length)]).multiplyScalar(0.7 + 0.3 * R()));
}
