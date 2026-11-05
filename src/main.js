import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import trackUrl from './assets/neon-drift-108bpm.mp3';
import { Soundtrack } from './audio.js';
import { AVENUE_EVERY, CELL, FOG_DENSITY } from './config.js';
import { City } from './city.js';
import { CameraRig } from './cameraRig.js';
import { Escort } from './escort.js';
import { Meteors } from './meteors.js';
import { Traffic } from './traffic.js';
import { mulberry32 } from './noise.js';
import { parseTurnChance } from './params.js';
import { BOOT_STAGES, stageProgress } from './loadProgress.js';
import { detectEnvironment, nextTier, pickQuality, qualitySettings } from './quality.js';
import { detectWebGL } from './webglSupport.js';
import { createGround } from './materials/groundMaterial.js';
import { createSky } from './materials/skyMaterial.js';
import { version } from '../package.json';
import './style.css';

const canvas = document.getElementById('scene');
const fallback = document.getElementById('fallback');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderStatus = document.getElementById('loader-status');
const loaderPercent = document.getElementById('loader-percent');
const bootStart = performance.now();

function setStage(index) {
  const ratio = stageProgress(BOOT_STAGES, index);
  const percent = Math.round(ratio * 100);
  if (loaderBar) loaderBar.style.width = `${percent}%`;
  if (loaderPercent) loaderPercent.textContent = `${percent}%`;
  if (loaderStatus) loaderStatus.textContent = BOOT_STAGES[index].label;
}

function paint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideLoader() {
  if (!loader) return;
  loader.classList.add('is-hidden');
  document.body.classList.add('ready');
  setTimeout(() => loader.remove(), 700);
}

function showFallback(title, text) {
  if (!fallback) return;
  fallback.querySelector('h1').textContent = title;
  fallback.querySelector('p').textContent = text;
  fallback.hidden = false;
  canvas.style.display = 'none';
  if (loader) loader.classList.add('is-hidden');
  document.body.classList.add('ready');
}

setTimeout(() => {
  if (loader && !loader.classList.contains('is-hidden') && loaderStatus) {
    loaderStatus.textContent = 'долго… проверьте WebGL';
  }
}, 15000);

const gl = detectWebGL();
if (!gl.supported) {
  showFallback(
    'Нужен WebGL',
    'Этот браузер не умеет рисовать 3D. Попробуйте Chrome, Safari или Firefox посвежее.',
  );
} else {
  start().catch((error) => {
    console.error(error);
    showFallback(
      'Не удалось запустить',
      'Обновите страницу или попробуйте другой браузер.',
    );
  });
}

async function start() {
  setStage(0);
  await paint();

  const env = detectEnvironment();
  const params = new URLSearchParams(window.location.search);
  const forcedQuality = params.get('quality');
  const tier =
    forcedQuality === 'high' || forcedQuality === 'low'
      ? forcedQuality
      : pickQuality({
          isMobile: env.isMobile,
          cores: env.cores,
          webgl2: gl.version === 2,
        });
  const adaptive = params.get('adaptive') !== '0';
  const soundEnabled = params.get('sound') !== '0';
  const holoRaw = params.get('holo');
  const holoValue = Number(holoRaw);
  const holoProbability =
    holoRaw === null || !Number.isFinite(holoValue)
      ? null
      : Math.min(1, Math.max(0, holoValue));
  const settings = qualitySettings(tier);
  const soundtrack = soundEnabled ? new Soundtrack({ url: trackUrl }) : null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier === 'high',
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(env.pixelRatio, settings.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05030c);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.5,
    1600,
  );

  setStage(1);
  await paint();

  const city = new City({
    cols: settings.ring,
    rows: settings.ring,
    reflection: settings.reflection,
    holoProbability,
  });
  scene.add(city.group);

  setStage(2);
  await paint();

  const ground = createGround({ cell: CELL, avenueEvery: AVENUE_EVERY });
  scene.add(ground.mesh);

  const sky = createSky();
  scene.add(sky.mesh);

  const trafficEnabled = params.get('traffic') !== '0';
  const traffic = trafficEnabled
    ? new Traffic({
        count: tier === 'high' ? 96 : 56,
        camera: camera.position,
        rng: mulberry32((Math.random() * 0x7fffffff) | 0),
      })
    : null;
  if (traffic) scene.add(traffic.group);

  const escort = new Escort();
  scene.add(escort.group);

  const meteorsEnabled = params.get('meteors') !== '0';
  const meteors = meteorsEnabled
    ? new Meteors({
        capacity: tier === 'high' ? 5 : 3,
        rng: mulberry32((Math.random() * 0x7fffffff) | 0),
      })
    : null;
  if (meteors) scene.add(meteors.group);

  setStage(3);
  await paint();
  renderer.compile(scene, camera);

  const rig = new CameraRig(camera, canvas);
  const turnChance = parseTurnChance(params.get('turn'));
  if (turnChance !== null) rig.setTurnChance(turnChance);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    tier === 'high' ? 0.7 : 0.5,
    0.45,
    0.55,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  setStage(4);
  await paint();
  if (soundtrack) await soundtrack.prepare();

  setStage(5);
  await paint();
  composer.render();

  const modeLabel = document.getElementById('mode-label');
  const fpsLabel = document.getElementById('fps-label');
  const buildingsLabel = document.getElementById('buildings-label');
  const toggle = document.getElementById('mode-toggle');
  const soundToggle = document.getElementById('sound-toggle');
  const turnFlash = document.getElementById('turn-flash');
  const appVersion = document.getElementById('app-version');
  if (appVersion) appVersion.textContent = `v${version}`;

  function syncModeUi() {
    const isSky = rig.mode === 'sky';
    modeLabel.textContent = isSky ? 'ВЫСОТА' : 'УЛИЦА';
    toggle.textContent = isSky ? 'УЛИЦА' : 'ВЫСОТА';
  }

  function toggleMode() {
    rig.toggleMode();
    syncModeUi();
  }

  function syncSoundUi() {
    if (!soundToggle) return;
    const playing = soundtrack?.playing === true;
    soundToggle.classList.toggle('is-on', playing);
    soundToggle.setAttribute('aria-pressed', String(playing));
    soundToggle.setAttribute('aria-label', playing ? 'Выключить звук' : 'Включить звук');
  }

  function toggleSound() {
    if (!soundtrack || !soundtrack.available) return;
    soundtrack.toggle();
    syncSoundUi();
  }

  if (soundtrack && soundToggle) {
    soundtrack.onChange = syncSoundUi;
    soundToggle.disabled = !soundtrack.available;
    if (!soundtrack.available) soundToggle.title = 'Звук недоступен';
    soundToggle.addEventListener('click', toggleSound);
    syncSoundUi();
  } else if (soundToggle) {
    soundToggle.hidden = true;
  }

  toggle.addEventListener('click', toggleMode);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyV') toggleMode();
    if (event.code === 'KeyM') toggleSound();
  });

  document.addEventListener('visibilitychange', () => {
    if (!soundtrack?.context) return;
    if (document.hidden) {
      soundtrack.context.suspend();
    } else if (soundtrack.playing) {
      soundtrack.play();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback('Контекст потерян', 'Перезагрузите страницу, чтобы вернуться в город.');
  });

  let lastFrame = performance.now();
  let elapsed = 0;
  let hudTimer = 0;
  let frames = 0;
  let fps = 60;
  let slowStreak = 0;
  let degraded = false;
  let firstFrame = false;

  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
    lastFrame = nowMs;
    elapsed += dt;

    rig.update(dt);
    if (turnFlash) {
      turnFlash.classList.toggle('show', nowMs < rig.turnFlashUntil);
    }
    city.update(nowMs, camera.position);
    if (traffic) {
      traffic.update(dt, camera.position);
      traffic.setTime(elapsed);
    }
    if (meteors) {
      meteors.update(dt, camera.position, rig.heading);
    }
    const turning = rig.nav?.turning === true;
    escort.update(
      dt,
      camera.position,
      rig.heading,
      elapsed,
      rig.mode === 'sky' ? 7 : 2.2,
      rig.mode === 'sky' ? 28 : turning ? 9 : 19,
    );
    city.setTime(elapsed);
    ground.setTime(elapsed);
    ground.mesh.position.x = camera.position.x;
    ground.mesh.position.z = camera.position.z;
    sky.mesh.position.copy(camera.position);

    composer.render();
    firstFrame = true;

    frames += 1;
    hudTimer += dt;
    if (hudTimer >= 0.5) {
      fps = Math.round(frames / hudTimer);
      frames = 0;
      hudTimer = 0;
      fpsLabel.textContent = String(fps);
      buildingsLabel.textContent = String(city.stats.buildings);

      if (!degraded && adaptive && (nextTier(tier, fps) === 'low' || (tier === 'low' && fps < 30))) {
        slowStreak += 1;
        if (slowStreak >= 4) {
          degraded = true;
          if (tier === 'high') {
            renderer.setPixelRatio(1);
            composer.setPixelRatio(1);
            composer.setSize(window.innerWidth, window.innerHeight);
          }
          bloom.enabled = false;
        }
      } else {
        slowStreak = 0;
      }
    }
  });

  syncModeUi();
  window.__neon = {
    city,
    rig,
    renderer,
    scene,
    camera,
    composer,
    traffic,
    escort,
    meteors,
    soundtrack,
    soundToggle,
    tier,
    settings,
    fogDensity: FOG_DENSITY,
  };

  await Promise.race([
    new Promise((resolve) => {
      const tick = () => (firstFrame ? resolve() : requestAnimationFrame(tick));
      tick();
    }),
    wait(4000),
  ]);

  const bootElapsed = performance.now() - bootStart;
  if (bootElapsed < 900) await wait(900 - bootElapsed);
  await wait(450);
  hideLoader();
}
