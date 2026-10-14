import * as THREE from 'three';
import { Character } from './character/character';
import { PoseSolver } from './anim/solver';
import { AnimGraph, type Behavior } from './anim/graph';
import { Seated } from './anim/behaviors/seated';
import { CallCat, GuitarPlay, GuitarReturn, GuitarTake, PetCat, PickPhone, PutPhone, Stretch, Wave, WalkAround, WindowTrip } from './anim/behaviors/actions';
import { LifeLayer } from './anim/life';
import { C } from './anim/controls';
import type { Ctx, Emotion } from './anim/ctx';
import type { World } from './anim/world';
import { buildRoom } from './scene/room';
import { L } from './scene/layout';
import { Wind } from './scene/wind';
import { createEnvironment } from './scene/environment';
import { Prop, Steam, buildGuitar, buildPhone, guitarStandTransform, phoneDeskTransform } from './scene/props';
import { Cat } from './cat/cat';
import { FaceController } from './face/face';
import { Speech } from './face/speech';
import { MC } from './face/visemes';
import { Bridge, type Command } from './core/bridge';
import { QualityGovernor, type Tier } from './core/quality';
import { rng } from './math/noise';
import { Spring1, damper, smoothstep } from './math/spring';

type ActionName = 'openWindow' | 'closeWindow' | 'callCat' | 'pickPhone' | 'putPhone' | 'playGuitar' | 'stopGuitar' | 'wave' | 'stretch' | 'walk';

export async function start() {
  const params = new URLSearchParams(location.search);
  const bridge = new Bridge();
  const app = document.getElementById('app')!;
  const quality0 = (params.get('quality') as Tier | 'auto' | null) ?? 'auto';
  const renderer = new THREE.WebGLRenderer({ antialias: quality0 !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b1a);
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.45;

  // ---------------------------------------------------------------- world
  const room = buildRoom();
  scene.add(room.group);
  const ch = new Character();
  scene.add(ch.root);
  ch.hairMat.userData.u.uKeyPos.value.copy(room.lampSpot.position);
  const cat = new Cat();
  scene.add(cat.root);
  const phone = new Prop(buildPhone());
  {
    const d = phoneDeskTransform();
    phone.attach(room.group, d.pos, d.quat);
    phone.snap();
  }
  const guitarBuild = buildGuitar();
  const guitar = new Prop(guitarBuild.group);
  {
    const st = guitarStandTransform();
    guitar.attach(room.group, st.pos, st.quat);
    guitar.snap();
  }
  const steam = new Steam(room.steamOrigin);
  scene.add(steam.points);
  const world: World = {
    room,
    character: ch,
    phone,
    guitar,
    guitarAnchors: { strum: guitarBuild.strum, fret: guitarBuild.fret, neckGrab: guitarBuild.neckGrab },
    cat,
    phoneInHand: false,
    guitarOnLap: false,
  };

  const quality = new QualityGovernor(renderer, [room.lampSpot], quality0);

  // ---------------------------------------------------------------- camera
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 30);
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const follow = new Spring1(0, 0.6);
  const camTargetSmooth = new THREE.Vector3().copy(L.cameraTarget);
  const userCam = new THREE.Vector3().copy(L.camera); // what the character looks at
  const frameCamera = (dt: number, headWorld: THREE.Vector3, seated: boolean) => {
    const aspect = innerWidth / Math.max(1, innerHeight);
    // landscape: the whole cosy room; portrait: a closer, character-centred shot
    const k = smoothstep(1.55, 0.7, aspect);
    camPos.set(0.1, 1.3, 1.75).lerp(new THREE.Vector3(0.04, 1.33, 1.15), k);
    camTarget.set(0.05, 1.1, -0.45).lerp(new THREE.Vector3(0.02, 1.2, -0.55), k);
    const fov = THREE.MathUtils.lerp(32, 40, k);
    const f = follow.update(seated ? 0 : 1, dt);
    if (f > 0.001) {
      // follow the character when he walks around; pull back in portrait
      camPos.lerp(new THREE.Vector3(0.1, 1.35, 2.3 + 0.5 * k), f * (0.4 + 0.6 * k));
      camTarget.lerp(new THREE.Vector3(headWorld.x * 0.8, 1.05, headWorld.z * 0.7 - 0.2), f);
    }
    camTargetSmooth.lerp(camTarget, damper(0.25, dt));
    // gentle hand-held drift (sub-degree)
    const t = performance.now() / 1000;
    camera.position.copy(camPos).add(new THREE.Vector3(Math.sin(t * 0.21) * 0.006, Math.sin(t * 0.17 + 1) * 0.004, 0));
    camera.lookAt(camTargetSmooth);
    if (Math.abs(camera.fov - fov) > 0.01 || camera.aspect !== aspect) {
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    if (params.get('cam') === 'face') {
      camera.position.set(0.05, 1.33, 0.25);
      camera.lookAt(0, 1.26, -0.62);
    } else if (params.get('cam') === 'body') {
      camera.position.set(0.1, 1.2, 0.9);
      camera.lookAt(0, 1.0, -0.6);
    }
    userCam.copy(params.get('cam') ? new THREE.Vector3(0.05, 1.33, 1.0) : camera.position);
  };

  // ---------------------------------------------------------------- animation
  const solver = new PoseSolver(ch);
  const graph = new AnimGraph<Ctx>();
  const life = new LifeLayer();
  const wind = new Wind();
  const face = new FaceController(ch, rng(77));
  const speech = new Speech();
  const R = rng(1234);
  const anchors: Record<string, THREE.Vector3> = { phone: new THREE.Vector3() };
  const ctx: Ctx = {
    time: 0,
    dt: 1 / 60,
    convo: 'idle',
    emotion: 'neutral',
    emotionAmt: 0,
    speechEnv: 0,
    beat: 0,
    micLevel: 0,
    camera: userCam,
    blend: (h) => graph.requestBlend(h),
    rand: R,
    anchors,
    gazeHint: null,
    emit: (e, d) => bridge.emit(e, d ?? {}),
    expr: null,
    mouth: null,
    eyesShut: 0,
    phoneInHand: false,
  };
  const seated = new Seated();
  const guitarPlay = new GuitarPlay(world);
  graph.switchTo(seated, ctx, 0.01);

  // action queue: behaviours run one after another, then fall back to the
  // default activity (sitting, or playing if the guitar is on the lap)
  const queue: { name: string; make: () => Behavior<Ctx> }[] = [];
  let currentAction: string | null = null;
  const defaultBehavior = () => (world.guitarOnLap ? guitarPlay : seated);
  const enqueue = (name: string, make: () => Behavior<Ctx>) => queue.push({ name, make });
  const runAction = (name: ActionName) => {
    const free = () => {
      if (world.guitarOnLap && name !== 'stopGuitar' && name !== 'playGuitar') enqueue('stopGuitar', () => new GuitarReturn(world));
    };
    switch (name) {
      case 'wave':
        free();
        enqueue(name, () => new Wave());
        break;
      case 'stretch':
        free();
        enqueue(name, () => new Stretch());
        break;
      case 'pickPhone':
        free();
        if (!world.phoneInHand) enqueue(name, () => new PickPhone(world));
        break;
      case 'putPhone':
        if (world.phoneInHand) enqueue(name, () => new PutPhone(world));
        break;
      case 'playGuitar':
        if (world.phoneInHand) enqueue('putPhone', () => new PutPhone(world));
        if (!world.guitarOnLap) enqueue(name, () => new GuitarTake(world));
        break;
      case 'stopGuitar':
        if (world.guitarOnLap) enqueue(name, () => new GuitarReturn(world));
        break;
      case 'callCat':
        free();
        enqueue(name, () => new CallCat(world));
        break;
      case 'openWindow':
      case 'closeWindow':
        free();
        enqueue(name, () => new WindowTrip(world, name === 'openWindow'));
        break;
      case 'walk':
        free();
        enqueue(name, () => new WalkAround(world));
        break;
      default:
        console.warn('unknown action', name);
    }
  };
  cat.onArrive = () => {
    cat.lookTarget = ch.bones['head'].getWorldPosition(new THREE.Vector3());
    if (!currentAction && !world.guitarOnLap && !world.phoneInHand) enqueue('petCat', () => new PetCat(world));
  };
  const pumpQueue = () => {
    const cur = graph.current;
    const finished = cur?.finished?.(ctx) ?? false;
    if (currentAction && finished) {
      bridge.emit('actionEnd', { name: currentAction });
      currentAction = null;
    }
    if ((finished || cur === seated || cur === guitarPlay) && queue.length) {
      const next = queue.shift()!;
      currentAction = next.name;
      graph.switchTo(next.make(), ctx, 0.3);
      bridge.emit('actionStart', { name: next.name });
    } else if (finished) {
      graph.switchTo(defaultBehavior(), ctx, 0.35);
    }
  };

  // ---------------------------------------------------------------- commands
  let lookOverride: 'phone' | 'window' | 'cat' | null = null;
  let paused = false;
  speech.onEvent = (e, d) => bridge.emit(e, d);
  bridge.onCommand((c: Command) => {
    switch (c.type) {
      case 'state':
        ctx.convo = c.value;
        break;
      case 'action':
        runAction(c.name as ActionName);
        break;
      case 'speak':
        ctx.convo = 'speaking';
        speech.speak(c);
        break;
      case 'speechWord':
        if (c.id === speech.id) speech.wordBoundary(c.charStart);
        break;
      case 'speechEnd':
        if (c.id === speech.id) speech.end();
        break;
      case 'stopSpeaking':
        speech.stop(true);
        break;
      case 'emotion':
        ctx.emotion = c.value as Emotion;
        ctx.emotionAmt = c.intensity ?? 1;
        break;
      case 'lookAt':
        lookOverride = c.target === 'camera' ? null : c.target;
        break;
      case 'micLevel':
        ctx.micLevel = c.value;
        break;
      case 'pause':
        paused = true;
        renderer.setAnimationLoop(null);
        break;
      case 'resume':
        if (paused) {
          paused = false;
          timer.reset();
          renderer.setAnimationLoop(() => frame());
        }
        break;
      case 'quality':
        quality.setTier(c.value);
        break;
    }
  });
  speech.onEvent = (e, d) => {
    bridge.emit(e, d);
    if (e === 'speechEnd' && ctx.convo === 'speaking') ctx.convo = 'idle';
  };

  // ---------------------------------------------------------------- taps
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerup', (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets: [string, THREE.Object3D][] = [
      ['cat', cat.root],
      ['phone', phone.obj],
      ['guitar', guitar.obj],
      ['window', room.sash],
      ['character', ch.headLocal],
    ];
    let best: { name: string; d: number } | null = null;
    for (const [name, o] of targets) {
      const hit = ray.intersectObject(o, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { name, d: hit.distance };
    }
    if (best) bridge.emit('tap', { target: best.name });
  });

  // ---------------------------------------------------------------- loop
  const timer = new THREE.Timer();
  const hud = params.get('hud') ? document.getElementById('hud') : null;
  const headW = new THREE.Vector3();
  const lookSmooth = new THREE.Vector3().copy(L.camera);
  const lookVel = new THREE.Vector3();
  let lastBeat = 0;
  let lastFrame = performance.now();
  const mouthExtra: Record<string, number> = {};

  function frame(render = true) {
    const now = performance.now();
    const wall = now - lastFrame;
    lastFrame = now;
    timer.update();
    const dt = THREE.MathUtils.clamp(timer.getDelta(), 1 / 240, 1 / 20);
    ctx.dt = dt;
    ctx.time += dt;
    ctx.phoneInHand = world.phoneInHand;
    phone.obj.getWorldPosition(anchors.phone);

    // speech -> context
    speech.update(dt);
    ctx.speechEnv = speech.env;
    if (speech.beats !== lastBeat) {
      ctx.beat += speech.beats - lastBeat;
      lastBeat = speech.beats;
    }
    if (speech.speaking && ctx.convo !== 'speaking') ctx.convo = 'speaking';

    pumpQueue();
    wind.update(dt, ctx.time, room.windowOpen);
    const c = graph.update(ctx);
    const isSeated = c[C.hipsPos + 1] < 0.7;
    life.apply(ctx, c, isSeated);

    // look target: behaviour's choice, optionally overridden, always smoothed
    const lt = new THREE.Vector3(c[C.look], c[C.look + 1], c[C.look + 2]);
    if (lookOverride === 'phone') lt.copy(anchors.phone);
    else if (lookOverride === 'window') lt.set(0.9, 1.5, L.window.z);
    else if (lookOverride === 'cat') cat.root.getWorldPosition(lt).add(new THREE.Vector3(0, 0.15, 0));
    {
      // critically damped spring on the look target (head turns ease in/out)
      const y = 2 * 0.69314718 / 0.16;
      const e = Math.exp(-y * dt);
      const j0 = lookSmooth.clone().sub(lt);
      const j1 = lookVel.clone().addScaledVector(j0, y);
      lookSmooth.copy(lt).add(j0.addScaledVector(j1, dt).multiplyScalar(e));
      lookVel.sub(j1.multiplyScalar(y * dt)).multiplyScalar(e);
    }
    c[C.look] = lookSmooth.x;
    c[C.look + 1] = lookSmooth.y;
    c[C.look + 2] = lookSmooth.z;
    solver.apply(c);

    // face
    ch.bones['head'].getWorldPosition(headW);
    const gaze = ctx.gazeHint ?? (lookOverride ? lt : userCam);
    for (const k of Object.keys(mouthExtra)) delete mouthExtra[k];
    if (ctx.mouth) Object.assign(mouthExtra, ctx.mouth);
    const ex = ctx.expr;
    face.update(dt, {
      speechMouth: speech.mouth,
      speaking: speech.speaking,
      env: speech.env,
      beat: ctx.beat,
      emotion: ex ? ex.emotion : ctx.convo === 'thinking' && ctx.emotion === 'neutral' ? 'thinking' : ctx.emotion,
      emotionAmt: ex ? ex.amt : ctx.convo === 'thinking' && ctx.emotion === 'neutral' ? 0.8 : ctx.emotionAmt,
      convo: ctx.convo,
      gazeTarget: gaze,
      lookingAtUser: !ctx.gazeHint && !lookOverride,
      extraMouth: ctx.mouth ? (mouthExtra as Partial<Record<keyof typeof MC, number>>) : null,
      eyesShut: ctx.eyesShut,
    });

    // props, physics, environment
    phone.update(dt);
    guitar.update(dt);
    ch.postUpdate(dt, ctx.time, wind.vec);
    cat.update(dt, ctx.time, wind.vec);
    room.update(dt, ctx.time, wind.vec);
    steam.update(dt, ctx.time, wind.vec, renderer.domElement.height / 2);
    frameCamera(dt, headW, isSeated);

    if (!render) return;
    renderer.render(scene, camera);
    quality.sample(wall, 1000 / 60);
    if (hud) hud.textContent = `fps ${quality.fps.toFixed(0)}  tier ${quality.tier}  scale ${quality.scale.toFixed(2)}  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\nstate ${ctx.convo}  action ${currentAction ?? '-'}  beh ${graph.current?.name}`;
  }

  addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
  document.addEventListener('visibilitychange', () => window.avatar.cmd({ type: document.hidden ? 'pause' : 'resume' }));

  // ---------------------------------------------------------------- start
  const still = params.get('still');
  for (const a of (params.get('do') ?? '').split(',').filter(Boolean)) runAction(a as ActionName);
  if (params.get('say')) window.avatar.cmd({ type: 'speak', id: 'dev', text: params.get('say')! });
  if (params.get('state')) ctx.convo = params.get('state') as Ctx['convo'];
  if (params.get('emotion')) ctx.emotion = params.get('emotion') as Emotion;
  ctx.emotionAmt = 1;
  const warm = still ? +still : 3;
  const simDt = params.get('simdt') ? +params.get('simdt')! : 0;
  for (let i = 0; i < warm; i++) {
    if (simDt) {
      // deterministic offline stepping for screenshots
      (timer as unknown as { getDelta: () => number }).getDelta = () => simDt;
    }
    frame(i === warm - 1);
  }
  document.getElementById('fade')!.classList.add('done');
  bridge.emit('ready', { version: window.avatar.version });
  (window as unknown as { __shotReady: boolean }).__shotReady = true;
  if (!still) renderer.setAnimationLoop(() => frame());
}
