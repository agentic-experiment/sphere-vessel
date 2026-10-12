'use strict';

// sphere-vessel — a luminous pearl trapped inside a glass vessel.
// One canvas, pointer steers gravity, impacts bloom ripples. Reasoning: README.md.

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const TAU = Math.PI * 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);

let W = 0, H = 0, cx = 0, neckY = 0, baseY = 0, maxR = 1;

const sphere = { x: 0, y: 0, vx: 0, vy: 0, r: 30 };
const tilt = { x: 0, y: 0 };
const tiltTarget = { x: 0, y: 0 };
const ripples = [];
const dust = [];
const stars = [];

// [height fraction 0 = mouth, 1 = base, half-width fraction of maxR]
// Single source of truth: the silhouette and the collision wall are the same function.
const PROFILE = [[0, .26], [.08, .30], [.26, .66], [.48, 1], [.78, .92], [1, .80]];

function halfWidth(y) {
  const t = clamp((y - neckY) / (baseY - neckY), 0, 1);
  for (let i = 1; i < PROFILE.length; i++) {
    if (t <= PROFILE[i][0] || i === PROFILE.length - 1) {
      const [t0, r0] = PROFILE[i - 1];
      const [t1, r1] = PROFILE[i];
      return lerp(r0, r1, smoothstep(clamp((t - t0) / (t1 - t0), 0, 1))) * maxR;
    }
  }
}

function layout() {
  W = innerWidth;
  H = innerHeight;
  cx = W / 2;
  neckY = H * (W < 560 ? .26 : .2);
  baseY = H * .88;
  maxR = Math.min(W * .38, (baseY - neckY) * .34);
  sphere.r = maxR * .25; // stays narrower than the mouth: the sphere can never escape
  sphere.x = clamp(sphere.x || cx, cx - maxR + sphere.r, cx + maxR - sphere.r);
  sphere.y = clamp(sphere.y || baseY - sphere.r, neckY + sphere.r * .5, baseY - sphere.r);
}

function seed() {
  for (let i = 0; i < 90; i++) {
    stars.push({ x: Math.random(), y: Math.random() * .9, p: Math.random() * TAU, s: .5 + Math.random() * 1.2 });
  }
  for (let i = 0; i < 70; i++) {
    dust.push({ x: Math.random(), y: Math.random(), vy: .006 + Math.random() * .02, sw: Math.random() * TAU, r: .4 + Math.random() * 1.4, a: .04 + Math.random() * .09 });
  }
}

// film grain, pre-rendered once
const grainTile = document.createElement('canvas');
grainTile.width = grainTile.height = 96;
{
  const g2 = grainTile.getContext('2d');
  const img = g2.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() * 2 - 1) * 60;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g2.putImageData(img, 0, 0);
}
const grain = ctx.createPattern(grainTile, 'repeat');

// radialGlow: circular falloff; ellipseGlow: same, squashed vertically
function radialGlow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function ellipseGlow(x, y, rx, ry, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  radialGlow(0, 0, rx, color);
  ctx.restore();
}

function vesselPath() {
  ctx.beginPath();
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const y = lerp(neckY, baseY, i / steps);
    const x = cx + halfWidth(y);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.quadraticCurveTo(cx, baseY + maxR * .12, cx - halfWidth(baseY), baseY);
  for (let i = steps; i >= 0; i--) {
    const y = lerp(neckY, baseY, i / steps);
    ctx.lineTo(cx - halfWidth(y), y);
  }
  ctx.closePath();
}

function addRipple(x, y, k) {
  if (ripples.length < 40) ripples.push({ x, y, r: sphere.r * .8, max: sphere.r * 2.6, speed: sphere.r * 4.4, k: clamp(k, .2, 1) });
}

function step(dt, t) {
  tilt.x = lerp(tilt.x, tiltTarget.x, 1 - Math.exp(-5 * dt));
  tilt.y = lerp(tilt.y, tiltTarget.y, 1 - Math.exp(-5 * dt));

  sphere.vx += tilt.x * 1600 * dt;
  sphere.vy += (1500 + tilt.y * 900) * dt;

  // a quiet life of its own
  sphere.vx += Math.sin(t * .00043 + 1.7) * 30 * dt;
  sphere.vy += Math.cos(t * .00061) * 20 * dt;

  const drag = Math.exp(-.32 * dt);
  sphere.vx *= drag;
  sphere.vy *= drag;

  sphere.x += sphere.vx * dt;
  sphere.y += sphere.vy * dt;

  collide();

  for (const rp of ripples) rp.r += rp.speed * dt;
}

function collide() {
  const dx = sphere.x - cx;
  const adx = Math.abs(dx);
  const limit = halfWidth(sphere.y) - sphere.r;
  if (adx > limit) {
    const slope = (halfWidth(sphere.y + 6) - halfWidth(sphere.y - 6)) / 12;
    let nx = Math.sign(dx), ny = -slope;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    sphere.x = cx + Math.sign(dx) * limit;
    const vn = sphere.vx * nx + sphere.vy * ny;
    if (vn > 0) {
      const e = .72; // restitution
      sphere.vx -= (1 + e) * vn * nx;
      sphere.vy -= (1 + e) * vn * ny;
      addRipple(sphere.x, sphere.y, Math.min(1, vn / 750) * .75 + .25);
    }
  }
  const floor = baseY - sphere.r;
  if (sphere.y > floor) {
    sphere.y = floor;
    if (sphere.vy > 40) addRipple(sphere.x, floor + sphere.r * .5, Math.min(1, sphere.vy / 900) * .75 + .25);
    sphere.vy = sphere.vy > 40 ? -sphere.vy * .5 : 0;
    sphere.vx *= .985; // rolling friction
  }
  sphere.y = Math.max(sphere.y, neckY - maxR * .06);
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1120');
  g.addColorStop(.55, '#080c16');
  g.addColorStop(1, '#04060c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  radialGlow(cx, H * .5, maxR * 3.2, 'rgba(96,140,255,.10)');
  ellipseGlow(cx, baseY + maxR * .1, maxR * 1.9, maxR * .5, 'rgba(255,176,116,.10)');

  for (const s of stars) {
    const tw = .5 + .5 * Math.sin(t * .0004 * (.3 + (s.p % .8)) + s.p);
    ctx.globalAlpha = .08 + tw * .28;
    ctx.fillStyle = '#cfe0ff';
    ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawDust(t) {
  ctx.fillStyle = '#ffe9d2';
  for (const d of dust) {
    d.y -= d.vy / 60;
    if (d.y < -.02) d.y = 1.02;
    ctx.globalAlpha = d.a * (.6 + .4 * Math.sin(t * .002 + d.sw));
    ctx.beginPath();
    ctx.arc((d.x + Math.sin(t * .0004 + d.sw) * .02) * W, d.y * H, d.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGlassBack() {
  vesselPath();
  const g = ctx.createLinearGradient(0, neckY, 0, baseY);
  g.addColorStop(0, 'rgba(150,190,255,.07)');
  g.addColorStop(1, 'rgba(150,190,255,.02)');
  ctx.fillStyle = g;
  ctx.fill();

  // ambient occlusion beneath the mouth
  ctx.save();
  vesselPath();
  ctx.clip();
  const ao = ctx.createLinearGradient(0, neckY, 0, neckY + (baseY - neckY) * .35);
  ao.addColorStop(0, 'rgba(2,4,10,.5)');
  ao.addColorStop(1, 'rgba(2,4,10,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(cx - maxR * 1.2, neckY, maxR * 2.4, (baseY - neckY) * .35);
  ctx.restore();
}

function drawShadowAndCaustic() {
  const h = clamp((baseY - sphere.y) / (baseY - neckY), 0, 1); // 0 = resting on the floor
  const closeness = 1 - h;
  const sy = baseY + sphere.r * .1;
  ellipseGlow(sphere.x, sy, sphere.r * (1.2 + h * 2.2), sphere.r * (.28 + h * .45),
    `rgba(2,3,8,${.55 * closeness + .1})`);
  ctx.globalCompositeOperation = 'lighter';
  ellipseGlow(sphere.x, sy - sphere.r * .12, sphere.r * (1.5 * closeness + .3), sphere.r * (.4 * closeness + .1),
    `rgba(255,170,110,${.22 * closeness})`);
  ctx.globalCompositeOperation = 'source-over';
}

function drawSphere(t) {
  const { x, y, r } = sphere;

  ctx.globalCompositeOperation = 'lighter';
  radialGlow(x, y, r * 2.7, 'rgba(255,188,128,.30)');
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();

  const body = ctx.createRadialGradient(x - r * .38, y - r * .44, r * .06, x, y, r * 1.2);
  body.addColorStop(0, '#fff7ec');
  body.addColorStop(.22, '#ffdcb2');
  body.addColorStop(.62, '#eda771');
  body.addColorStop(1, '#7e4526');
  ctx.fillStyle = body;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // cool bounce light from the glass, lower right
  ctx.save();
  ctx.translate(x + r * .48, y + r * .5);
  ctx.scale(1, .9);
  radialGlow(0, 0, r, 'rgba(120,190,255,.26)');
  ctx.restore();

  // slow sheen
  radialGlow(x + Math.sin(t * .0006) * r * .18 - r * .05, y - r * .5, r * .7, 'rgba(255,255,255,.45)');
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, r - .5, 0, TAU);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,240,220,.35)';
  ctx.stroke();
}

function drawRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    const life = 1 - rp.r / rp.max;
    if (life <= 0) { ripples.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.ellipse(rp.x, rp.y, rp.r, rp.r * .42, 0, 0, TAU);
    ctx.lineWidth = Math.max(.5, 2.4 * life * rp.k);
    ctx.strokeStyle = `rgba(255,214,170,${.5 * life * rp.k})`;
    ctx.stroke();
  }
}

function drawGlassFront() {
  vesselPath();
  const rim = ctx.createLinearGradient(cx - maxR, 0, cx + maxR, 0);
  rim.addColorStop(0, 'rgba(190,220,255,.75)');
  rim.addColorStop(.2, 'rgba(190,220,255,.14)');
  rim.addColorStop(.8, 'rgba(190,220,255,.12)');
  rim.addColorStop(1, 'rgba(190,220,255,.45)');
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rim;
  ctx.stroke();

  ctx.save();
  vesselPath();
  ctx.clip();
  const spec = ctx.createLinearGradient(cx - maxR * .85, 0, cx - maxR * .4, 0);
  spec.addColorStop(0, 'rgba(255,255,255,.15)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(cx - maxR, neckY, maxR, baseY - neckY);
  ctx.restore();

  // the mouth
  ctx.beginPath();
  ctx.ellipse(cx, neckY, halfWidth(neckY), halfWidth(neckY) * .3, 0, 0, TAU);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(200,225,255,.35)';
  ctx.stroke();
}

function drawVignette() {
  const g = ctx.createRadialGradient(cx, H * .48, Math.min(W, H) * .3, cx, H * .48, Math.hypot(W, H) * .62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,5,.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function render(t) {
  drawBackground(t);
  drawDust(t);
  drawGlassBack();
  drawShadowAndCaustic();
  drawSphere(t);
  drawRipples();
  drawGlassFront();
  drawVignette();

  ctx.globalAlpha = .05;
  ctx.fillStyle = grain;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

addEventListener('resize', layout);

addEventListener('pointermove', e => {
  tiltTarget.x = clamp((e.clientX / innerWidth - .5) * 1.6, -1, 1);
  tiltTarget.y = clamp((e.clientY / innerHeight - .5) * 1.2, -1, 1);
});

addEventListener('pointerdown', e => {
  const dx = sphere.x - e.clientX;
  const dy = sphere.y - e.clientY;
  const d = Math.hypot(dx, dy) || 1;
  const power = 500 + 600 * (1 - clamp(d / (Math.hypot(W, H) * .5), 0, 1));
  sphere.vx += dx / d * power;
  sphere.vy += dy / d * power;
});

layout();
seed();

if (REDUCED) {
  render(0); // one still frame, no animation
} else {
  let last = performance.now();
  const frame = now => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    step(dt, now);
    render(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
