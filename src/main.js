import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AVENUE_EVERY, CELL, FOG_DENSITY } from './config.js';
import { City } from './city.js';
import { CameraRig } from './cameraRig.js';
import { detectEnvironment, nextTier, pickQuality, qualitySettings } from './quality.js';
import { detectWebGL } from './webglSupport.js';
import { createGround } from './materials/groundMaterial.js';
import { createSky } from './materials/skyMaterial.js';
import './style.css';

const canvas = document.getElementById('scene');
const fallback = document.getElementById('fallback');

function showFallback(title, text) {
  if (!fallback) return;
  fallback.querySelector('h1').textContent = title;
  fallback.querySelector('p').textContent = text;
  fallback.hidden = false;
  canvas.style.display = 'none';
}

const gl = detectWebGL();
if (!gl.supported) {
  showFallback(
    'Нужен WebGL',
    'Этот браузер не умеет рисовать 3D. Попробуйте Chrome, Safari или Firefox посвежее.',
  );
} else {
  start();
}

function start() {
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
  const settings = qualitySettings(tier);

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

  const city = new City({
    cols: settings.ring,
    rows: settings.ring,
    reflection: settings.reflection,
  });
  scene.add(city.group);

  const ground = createGround({ cell: CELL, avenueEvery: AVENUE_EVERY });
  scene.add(ground.mesh);

  const sky = createSky();
  scene.add(sky.mesh);

  const rig = new CameraRig(camera, canvas);

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

  const modeLabel = document.getElementById('mode-label');
  const fpsLabel = document.getElementById('fps-label');
  const buildingsLabel = document.getElementById('buildings-label');
  const toggle = document.getElementById('mode-toggle');

  function syncModeUi() {
    const isSky = rig.mode === 'sky';
    modeLabel.textContent = isSky ? 'ВЫСОТА' : 'УЛИЦА';
    toggle.textContent = isSky ? 'УЛИЦА' : 'ВЫСОТА';
  }

  function toggleMode() {
    rig.toggleMode();
    syncModeUi();
  }

  toggle.addEventListener('click', toggleMode);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyV') toggleMode();
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
  let ready = false;

  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
    lastFrame = nowMs;
    elapsed += dt;

    rig.update(dt);
    city.update(nowMs, camera.position);
    city.setTime(elapsed);
    ground.setTime(elapsed);
    ground.mesh.position.x = camera.position.x;
    ground.mesh.position.z = camera.position.z;
    sky.mesh.position.copy(camera.position);

    composer.render();

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

    if (!ready) {
      ready = true;
      document.body.classList.add('ready');
    }
  });

  syncModeUi();
  window.__neon = { city, rig, renderer, scene, camera, composer, tier, settings, fogDensity: FOG_DENSITY };
}
