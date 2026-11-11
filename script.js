'use strict';

const body = document.body;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobile = window.matchMedia('(max-width: 700px)');
const menu = document.querySelector('.menu-toggle');
const navigation = document.getElementById('main-navigation');
const motionButton = document.querySelector('.motion-toggle');
const hero = document.querySelector('.hero-scroll');
const heroStage = document.querySelector('.hero-stage');
const scene = document.querySelector('.signal-scene');
const replay = document.querySelector('.replay-intro');
const steps = [...document.querySelectorAll('.signal-steps li')];
const sticky = document.querySelector('.hero-sticky');
const header = document.querySelector('.header');
const hud = {
  cursor: document.querySelector('[data-hud="cursor"]'),
  rot: document.querySelector('[data-hud="rot"]'),
  phase: document.querySelector('[data-hud="phase"]')
};
const stepNames = ['Captar', 'Processar', 'Controlar'];
const pointer = { x: .5, y: .5, active: false };
const decimal = (value) => value.toFixed(2).replace('.', ',');
let pulseStart = -1e9;
let userPaused = false;
let lenis = null;
let frameId = 0;
let previousTime = 0;
let visualTime = 0;
let lastScrollY = -1;
let sceneVisible = true;
let needsLayout = true;
let currentStep = -1;

function motionEnabled() {
  return !userPaused && !reducedMotion.matches;
}

function setMenu(open) {
  navigation.hidden = mobile.matches && !open;
  menu.setAttribute('aria-expanded', String(mobile.matches && open));
}

menu.hidden = false;
setMenu(false);
mobile.addEventListener('change', () => { setMenu(false); needsLayout = true; requestFrame(); });
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.querySelector('.header').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menu.focus();
  }
});

function focusDestination(destination) {
  if (!destination.matches('a, button, input, [tabindex]')) destination.setAttribute('tabindex', '-1');
  destination.focus({ preventScroll: true });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const destination = document.getElementById(anchor.hash.slice(1));
    if (!destination) return;
    setMenu(false);
    if (lenis) {
      event.preventDefault();
      history.pushState(null, '', anchor.hash);
      lenis.scrollTo(destination, {
        offset: 0,
        onComplete: () => focusDestination(destination)
      });
    } else {
      requestAnimationFrame(() => focusDestination(destination));
    }
  });
});
window.addEventListener('popstate', () => {
  const destination = document.getElementById(location.hash.slice(1));
  if (lenis && destination) lenis.scrollTo(destination, { immediate: true });
});

const graphCanvases = [...document.querySelectorAll('[data-graph]')];
const allCanvases = [document.getElementById('signal-field'), ...graphCanvases];
const surfaces = new Map();
allCanvases.forEach((canvas) => {
  const context = canvas.getContext('2d');
  if (context) surfaces.set(canvas, { context, width: 1, height: 1, visible: false });
});
const resizeObserver = new ResizeObserver((entries) => {
  entries.forEach(({ target, contentRect }) => {
    const surface = surfaces.get(target);
    if (!surface) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    surface.width = contentRect.width;
    surface.height = contentRect.height;
    target.width = Math.round(contentRect.width * pixelRatio);
    target.height = Math.round(contentRect.height * pixelRatio);
    surface.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  });
  needsLayout = true;
  requestFrame();
});
surfaces.forEach((_, canvas) => resizeObserver.observe(canvas));

const projectMedia = [...document.querySelectorAll('.project-media')];
const visibleMedia = new Set();
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const { target, isIntersecting } = entry;
    if (target === heroStage) {
      sceneVisible = isIntersecting;
      scene.dataset.visible = String(isIntersecting);
    } else if (surfaces.has(target)) {
      const surface = surfaces.get(target);
      surface.visible = isIntersecting;
      if (isIntersecting && surface.revealStart === undefined) surface.revealStart = visualTime;
    } else if (target.classList.contains('project-media')) {
      if (isIntersecting) visibleMedia.add(target);
      else visibleMedia.delete(target);
    } else {
      target.dataset.visible = String(isIntersecting);
    }
  });
  needsLayout = true;
  requestFrame();
}, { rootMargin: '40px' });
visibilityObserver.observe(heroStage);
visibilityObserver.observe(document.querySelector('.partner-marquee'));
surfaces.forEach((_, canvas) => visibilityObserver.observe(canvas));
projectMedia.forEach((media) => visibilityObserver.observe(media));

function trace(context, points) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function pointAlong(points, progress) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  let distance = progress * lengths.reduce((sum, length) => sum + length, 0);
  for (let index = 0; index < lengths.length; index++) {
    if (distance <= lengths[index]) {
      const fraction = distance / lengths[index];
      return [
        points[index][0] + (points[index + 1][0] - points[index][0]) * fraction,
        points[index][1] + (points[index + 1][1] - points[index][1]) * fraction
      ];
    }
    distance -= lengths[index];
  }
  return points[points.length - 1];
}

function drawSignalField(surface, time) {
  const { context: ctx, width: w, height: h } = surface;
  ctx.clearRect(0, 0, w, h);
  const centerX = w * .53;
  const centerY = h * .48;
  const radius = Math.min(w * .43, h * .36);
  // Dot matrix: a wave leaves the sensor and the cursor lifts the dots near it.
  const gap = w < 520 ? 30 : 26;
  const pointerX = pointer.x * w;
  const pointerY = pointer.y * h;
  for (let gx = gap / 2; gx < w; gx += gap) {
    for (let gy = gap / 2; gy < h; gy += gap) {
      const wave = Math.pow(Math.max(0, Math.sin(Math.hypot(gx - centerX, gy - centerY) * .028 - time * .0026)), 6);
      const near = pointer.active ? Math.max(0, 1 - Math.hypot(gx - pointerX, gy - pointerY) / 150) : 0;
      const size = 1 + wave * .8 + near * 1.8;
      ctx.globalAlpha = Math.min(1, .06 + wave * .24 + near * .6);
      ctx.fillStyle = near > .05 || wave > .5 ? '#ffa16b' : '#bec4c6';
      ctx.fillRect(gx - size / 2, gy - size / 2, size, size);
    }
  }
  ctx.globalAlpha = 1;
  // Circuit traces carry packets into and out of the sensor.
  for (let line = 0; line < 12; line++) {
    const side = line < 6 ? -1 : 1;
    const row = line % 6;
    const y = h * (.16 + row * .13);
    const edge = side < 0 ? 4 : w - 4;
    const bendX = centerX + side * radius * (1.08 - row * .035);
    const points = [[edge, y], [bendX, y], [centerX + side * radius * .57, centerY + (row - 2.5) * 14], [centerX, centerY]];
    if (side > 0) points.reverse();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(185,191,192,.19)';
    trace(ctx, points);
    const travel = ((time * .00016) + line * .11) % 1;
    const [x, packetY] = pointAlong(points, travel);
    const [tailX, tailY] = pointAlong(points, Math.max(0, travel - .06));
    const trail = ctx.createLinearGradient(tailX, tailY, x, packetY);
    trail.addColorStop(0, 'rgba(255,161,107,0)');
    trail.addColorStop(1, 'rgba(255,196,160,.9)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1.6;
    trace(ctx, [[tailX, tailY], [x, packetY]]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.fillStyle = line % 3 === 0 ? '#ffe6d3' : '#dd864f';
    ctx.arc(x, packetY, line % 3 === 0 ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8d76614d';
    ctx.strokeRect(edge - 3, y - 3, 6, 6);
  }
  // Three projected sensor ranges rotate slowly around the physical emblem.
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(-.25 + Math.sin(time * .00008) * .1);
  // Radar sweep inside the sensor range.
  if (ctx.createConicGradient) {
    ctx.save();
    ctx.scale(1, .61);
    const sweep = ctx.createConicGradient(time * .0009, 0, 0);
    sweep.addColorStop(0, 'rgba(255,161,107,0)');
    sweep.addColorStop(.8, 'rgba(255,161,107,0)');
    sweep.addColorStop(1, 'rgba(255,161,107,.22)');
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Shockwaves: two when the scan finishes, one at every phase change.
  [time - 1150, time - 1550, time - pulseStart].forEach((age) => {
    if (age < 0 || age > 1600) return;
    const life = age / 1600;
    const reach = .3 + (1 - Math.pow(1 - life, 3)) * 1.15;
    ctx.strokeStyle = `rgba(255,176,130,${(1 - life) * .75})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * reach, radius * .61 * reach, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = ring === 0 ? '#c58a4e55' : '#7c85862c';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius + ring * 14, radius * .61 + ring * 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    const angle = time * .0003 + ring * 2;
    ctx.fillStyle = '#f7cda5';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * (radius + ring * 14), Math.sin(angle) * (radius * .61 + ring * 11), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function graphValue(type, x) {
  const cycle = ((x % 1) + 1) % 1;
  if (type === 'pulse') return cycle > .32 && cycle < .47 ? .8 : .16;
  if (type === 'temperature') return .46 + Math.sin(x * Math.PI * 2) * .17 + Math.sin(x * Math.PI * 5) * .02;
  if (type === 'access') return Math.exp(-Math.pow((cycle - .46) / .08, 2)) * .7 + .1;
  const bump = (center, width, amplitude) => amplitude * Math.exp(-Math.pow((cycle - center) / width, 2));
  return .28 + bump(.18, .045, .08) - bump(.35, .016, .1) + bump(.39, .012, .65) - bump(.43, .02, .18) + bump(.64, .08, .15);
}

function drawGraph(canvas, surface, time) {
  const { context: ctx, width: w, height: h } = surface;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = .6;
  ctx.strokeStyle = '#ffffff16';
  for (let row = 1; row < 4; row++) trace(ctx, [[0, h * row / 4], [w, h * row / 4]]);
  // Time marks travel with the signal.
  for (let x = 44 - (time * w * .00004) % 44; x < w; x += 44) trace(ctx, [[x, 0], [x, h]]);
  const reveal = motionEnabled() ? Math.max(0, Math.min(1, (time - (surface.revealStart ?? time)) / 1500)) : 1;
  const shown = (w - 16) * (1 - Math.pow(1 - reveal, 3));
  const points = [];
  for (let x = 0; x <= shown; x += 2) {
    points.push([x, h - 12 - graphValue(canvas.dataset.graph, x / w * 3 + time * .00012) * (h - 24)]);
  }
  if (points.length < 2) return;
  const [headX, headY] = points[points.length - 1];
  const fill = ctx.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, 'rgba(255,161,107,.28)');
  fill.addColorStop(1, 'rgba(255,161,107,0)');
  ctx.beginPath();
  ctx.moveTo(0, h);
  points.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(headX, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,161,107,.16)';
  ctx.lineWidth = 6;
  trace(ctx, points);
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#a6724e55');
  gradient.addColorStop(.7, '#ffa16b');
  gradient.addColorStop(1, '#ffe3c8');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.6;
  trace(ctx, points);
  // Read head: the newest sample, with a pulse.
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffa16b55';
  trace(ctx, [[headX, 0], [headX, h]]);
  const beat = (time % 1400) / 1400;
  ctx.strokeStyle = `rgba(255,227,200,${1 - beat})`;
  ctx.beginPath();
  ctx.arc(headX, headY, 3 + beat * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe3c8';
  ctx.beginPath();
  ctx.arc(headX, headY, 3, 0, Math.PI * 2);
  ctx.fill();
}

function updateScrollEffects() {
  const scrollY = window.scrollY;
  if (scrollY === lastScrollY && !needsLayout) return;
  lastScrollY = scrollY;
  needsLayout = false;
  const enabled = motionEnabled();
  const bounds = hero.getBoundingClientRect();
  const distance = Math.max(1, hero.offsetHeight - window.innerHeight + 83);
  const progress = mobile.matches ? 0 : Math.max(0, Math.min(1, (83 - bounds.top) / distance));
  hero.style.setProperty('--hero-progress', enabled ? progress.toFixed(4) : '0');
  const step = Math.min(2, Math.floor(progress * 3));
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  header.style.setProperty('--page-progress', scrollable > 0 ? (scrollY / scrollable).toFixed(4) : '0');
  hud.rot.textContent = (enabled ? progress * 15 : 0).toFixed(1).replace('.', ',') + '°';
  if (currentStep !== step) {
    steps.forEach((element, index) => element.classList.toggle('is-active', index === step));
    if (currentStep !== -1 && enabled) pulseStart = visualTime;
    currentStep = step;
    hud.phase.textContent = stepNames[step];
  }
  visibleMedia.forEach((media) => {
    const rect = media.getBoundingClientRect();
    const position = Math.max(-1, Math.min(1, (window.innerHeight / 2 - rect.top - rect.height / 2) / window.innerHeight));
    media.style.setProperty('--image-drift', enabled ? position * 42 + 'px' : '0px');
    media.style.setProperty('--image-scale', enabled ? 1.03 + Math.abs(position) * .04 : '1');
    media.style.setProperty('--scan-position', enabled ? (position + 1) * 50 + '%' : '50%');
  });
}

function render(now) {
  frameId = 0;
  if (document.hidden) return;
  const elapsed = previousTime ? Math.min(now - previousTime, 40) : 0;
  previousTime = now;
  if (motionEnabled()) visualTime += elapsed;
  updateScrollEffects();
  let visibleCanvas = false;
  surfaces.forEach((surface, canvas) => {
    if (!surface.visible) return;
    visibleCanvas = true;
    if (canvas.id === 'signal-field') drawSignalField(surface, visualTime);
    else drawGraph(canvas, surface, visualTime);
  });
  if (motionEnabled() && (visibleCanvas || sceneVisible)) requestFrame();
}

function requestFrame() {
  if (!frameId && !document.hidden) frameId = requestAnimationFrame(render);
}

function configureMotion() {
  const enabled = motionEnabled();
  body.dataset.motion = enabled ? 'running' : 'paused';
  motionButton.setAttribute('aria-pressed', String(!enabled));
  motionButton.textContent = enabled ? 'Pausar animações' : (reducedMotion.matches ? 'Movimento reduzido' : 'Retomar animações');
  motionButton.disabled = reducedMotion.matches;
  if (enabled && window.Lenis && !lenis) {
    lenis = new window.Lenis({ autoRaf: true, lerp: .085, smoothWheel: true, syncTouch: false });
  }
  if (!enabled && lenis) { lenis.destroy(); lenis = null; }
  document.documentElement.dataset.inertia = lenis ? 'enabled' : 'native';
  if (!enabled) {
    body.classList.remove('intro-running');
    document.querySelectorAll('.will-reveal').forEach((media) => media.classList.remove('will-reveal'));
  }
  replay.hidden = !enabled;
  needsLayout = true;
  requestFrame();
}

motionButton.hidden = false;
motionButton.addEventListener('click', () => { userPaused = !userPaused; configureMotion(); });
reducedMotion.addEventListener('change', configureMotion);
window.addEventListener('scroll', requestFrame, { passive: true });
window.addEventListener('resize', () => { needsLayout = true; requestFrame(); }, { passive: true });
document.addEventListener('visibilitychange', () => {
  body.dataset.hidden = String(document.hidden);
  previousTime = 0;
  if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; }
  else requestFrame();
});

heroStage.addEventListener('pointermove', (event) => {
  if (!motionEnabled() || event.pointerType !== 'mouse') return;
  const bounds = heroStage.getBoundingClientRect();
  scene.style.setProperty('--pointer-x', ((event.clientX - bounds.left) / bounds.width - .5) * 11 + 'deg');
  scene.style.setProperty('--pointer-y', -((event.clientY - bounds.top) / bounds.height - .5) * 9 + 'deg');
  const sceneBounds = scene.getBoundingClientRect();
  const stickyBounds = sticky.getBoundingClientRect();
  pointer.x = (event.clientX - sceneBounds.left) / sceneBounds.width;
  pointer.y = (event.clientY - sceneBounds.top) / sceneBounds.height;
  pointer.active = true;
  sticky.style.setProperty('--mx', event.clientX - stickyBounds.left + 'px');
  sticky.style.setProperty('--my', event.clientY - stickyBounds.top + 'px');
  hud.cursor.textContent = decimal((event.clientX - bounds.left) / bounds.width) + ' · ' + decimal((event.clientY - bounds.top) / bounds.height);
});
heroStage.addEventListener('pointerleave', () => {
  scene.style.setProperty('--pointer-x', '0deg');
  scene.style.setProperty('--pointer-y', '0deg');
  pointer.active = false;
  sticky.style.removeProperty('--mx');
  sticky.style.removeProperty('--my');
});

function scramble(element) {
  const text = element.textContent;
  const glyphs = '01<>/#=+';
  const start = performance.now();
  (function tick(now) {
    const done = Math.min(1, (now - start) / 700);
    const fixed = Math.floor(text.length * done);
    element.textContent = text.slice(0, fixed) + [...text.slice(fixed)].map((character) => character === ' ' ? ' ' : glyphs[Math.random() * glyphs.length | 0]).join('');
    if (done < 1) requestAnimationFrame(tick);
  })(start);
}

// Photos open with a scan wipe the first time they enter the viewport.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    if (!isIntersecting) return;
    revealObserver.unobserve(target);
    if (!motionEnabled()) return;
    const media = target.querySelector('.project-media');
    media.classList.remove('will-reveal');
    media.classList.add('is-revealed');
    scramble(target.querySelector('.project-category'));
  });
}, { threshold: .25 });

projectMedia.forEach((media) => {
  const overlay = document.createElement('span');
  overlay.className = 'media-hud';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<i class="media-cross"></i><b class="media-coord"></b>';
  media.append(overlay);
  const coordinates = overlay.querySelector('.media-coord');
  if (motionEnabled()) {
    media.classList.add('will-reveal');
    // The section is observed because the photo's own clip-path hides it from the observer.
    revealObserver.observe(media.closest('.project-section'));
  }
  media.addEventListener('pointermove', (event) => {
    if (!motionEnabled() || event.pointerType !== 'mouse') return;
    const bounds = media.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    media.style.setProperty('--image-tilt', (x - .5) * 5 + 'deg');
    media.style.setProperty('--cx', x * 100 + '%');
    media.style.setProperty('--cy', y * 100 + '%');
    coordinates.textContent = 'X ' + decimal(x) + ' · Y ' + decimal(y);
  });
  media.addEventListener('pointerleave', () => media.style.setProperty('--image-tilt', '0deg'));
});

function playIntro() {
  if (!motionEnabled()) return;
  body.classList.remove('intro-running');
  void heroStage.offsetWidth;
  body.classList.add('intro-running');
  visualTime = 0;
  requestFrame();
}
replay.addEventListener('click', () => {
  if (lenis) lenis.scrollTo(0);
  else window.scrollTo({ top: 0, behavior: 'smooth' });
  playIntro();
});
configureMotion();
playIntro();
document.getElementById('current-year').textContent = String(new Date().getFullYear());

