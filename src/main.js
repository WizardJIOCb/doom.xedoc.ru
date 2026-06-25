import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import "./styles.css";

const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const playerNameInput = document.querySelector("#playerNameInput");
const roomNameInput = document.querySelector("#roomNameInput");
const createRoomButton = document.querySelector("#createRoomButton");
const refreshRoomsButton = document.querySelector("#refreshRoomsButton");
const roomStatus = document.querySelector("#roomStatus");
const roomList = document.querySelector("#roomList");
const healthText = document.querySelector("#healthText");
const armorText = document.querySelector("#armorText");
const healthBar = document.querySelector("#healthBar");
const armorBar = document.querySelector("#armorBar");
const waveText = document.querySelector("#waveText");
const killText = document.querySelector("#killText");
const ammoText = document.querySelector("#ammoText");
const weaponLabel = document.querySelector(".weapon span");
const shieldCooldown = document.querySelector("#shieldCooldown");
const damageVignette = document.querySelector("#damageVignette");
const hitFlash = document.querySelector("#hitFlash");
const cheatConsole = document.querySelector("#cheatConsole");
const consoleLog = document.querySelector("#consoleLog");
const consoleForm = document.querySelector("#consoleForm");
const consoleInput = document.querySelector("#consoleInput");
const stickBase = document.querySelector("#stickBase");
const stickKnob = document.querySelector("#stickKnob");
const touchFire = document.querySelector("#touchFire");
const touchShield = document.querySelector("#touchShield");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070504);
scene.fog = new THREE.FogExp2(0x120806, 0.018);

const ARENA_RADIUS = 42;
const ENEMY_HIT_RADIUS = 1.15;
const PLAYER_RADIUS = 1.05;
const PLAYER_HEIGHT = 2.2;
const MAX_ENEMIES = 20;
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const AMMO_MAX = 999;
const WEAPONS = [
  { name: "Carbine", cost: 1, cooldown: 0.13, damage: 30, speed: 82, ttl: 1.25, shots: 1, spread: 0.004, color: 0x57ffd7, size: 1.05 },
  { name: "Scatter", cost: 4, cooldown: 0.72, damage: 18, speed: 66, ttl: 0.72, shots: 9, spread: 0.075, color: 0xffc06b, size: 0.85 },
  { name: "Repeater", cost: 1, cooldown: 0.065, damage: 16, speed: 92, ttl: 1.0, shots: 1, spread: 0.018, color: 0x84ff5c, size: 0.72 },
  { name: "Lance", cost: 6, cooldown: 0.95, damage: 94, speed: 118, ttl: 1.35, shots: 1, spread: 0.001, pierce: 4, color: 0xffef9a, size: 1.55 },
  { name: "Mortar", cost: 8, cooldown: 1.1, damage: 72, speed: 42, ttl: 1.75, shots: 1, spread: 0.012, blastRadius: 4.8, gravity: 10, color: 0xff4a18, size: 1.45 },
  { name: "Slicer", cost: 3, cooldown: 0.48, damage: 46, speed: 54, ttl: 1.1, shots: 1, spread: 0.006, pierce: 2, color: 0x5fffe0, size: 1.35, disc: true },
  { name: "Nailgun", cost: 2, cooldown: 0.2, damage: 34, speed: 76, ttl: 1.2, shots: 3, spread: 0.032, color: 0xb48cff, size: 0.82 }
];
const ENEMY_TYPES = ["raider", "brute", "wraith", "imp", "stalker", "sentinel", "crawler"];

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(0, PLAYER_HEIGHT, 0);

const controls = new PointerLockControls(camera, document.body);
controls.getObject().position.set(0, PLAYER_HEIGHT, 18);
scene.add(controls.getObject());

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const flatForward = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const targetTmp = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const ragdollCornerTmp = new THREE.Vector3();
const WEAPON_BASE_POSITION = new THREE.Vector3(0.12, -0.34, -0.56);

const keys = new Set();
const projectiles = [];
const enemyBolts = [];
const enemies = [];
const enemiesById = new Map();
const pickups = [];
const sparks = [];
const bloodDrops = [];
const embers = [];
const decals = [];
const ragdolls = [];
const hazards = [];
const jumpPads = [];
const remoteProjectiles = [];

let weaponRig;
let muzzleLight;
let shieldMesh;
let weaponModels = [];

const state = {
  started: false,
  alive: true,
  health: 100,
  armor: 75,
  ammo: AMMO_MAX,
  ownedWeapons: WEAPONS.map(() => true),
  weaponIndex: 0,
  kills: 0,
  wave: 1,
  nextWaveAt: 0,
  fireCooldown: 0,
  shieldCooldown: 0,
  shieldCharge: 1,
  invulnerable: 0,
  cameraKick: 0,
  shake: 0,
  verticalVelocity: 0,
  jumpOffset: 0,
  grounded: true,
  boostX: 0,
  boostZ: 0,
  godMode: false,
  infiniteAmmo: false,
  noCooldown: false,
  megaJump: false,
  consoleOpen: false,
  spawnTimer: 0,
  touchLookActive: false,
  touchFireHeld: false,
  touchShieldHeld: false
};

const network = {
  socket: null,
  id: null,
  roomId: null,
  roomName: "",
  hostId: null,
  playerName: "Slayer",
  seed: 1,
  rooms: [],
  peers: new Map(),
  connected: false,
  lastSend: 0,
  lastEnemySend: 0,
  statusEl: null
};

let gameSeed = 1;
let nextEnemyId = 1;

const input = {
  x: 0,
  z: 0,
  sprint: false,
  lookPointer: null,
  stickPointer: null,
  stickX: 0,
  stickY: 0,
  lastLookX: 0,
  lastLookY: 0
};

const materials = {};
const geometries = {};
const sparkMaterials = new Map();
const bloodMaterials = new Map();
const sparkPool = [];
const bloodPool = [];
const spawnQueue = [];
const MAX_SPARK_POOL = 220;
const MAX_BLOOD_POOL = 180;
const MAX_BLOOD_DROPS = 160;
const MAX_RAGDOLL_PARTS = 120;
const SPAWN_DRIP_DELAY = 0.14;
const ENEMY_EMERGE_TIME = 0.65;

let spawnDripTimer = 0;

initAssets();
buildWorld();
bindEvents();
initNetwork();
animate();

window.ironCitadelDebug = {
  state,
  network,
  weapons: WEAPONS,
  enemies,
  bloodDrops,
  ragdolls,
  camera,
  controls,
  isEnemyHost
};

function initAssets() {
  const stoneTexture = makeNoiseTexture("#392821", "#0b0807", 512, 2100, 0.42, "stone");
  stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
  stoneTexture.repeat.set(18, 18);

  const metalTexture = makeNoiseTexture("#403832", "#080807", 512, 760, 0.25, "metal");
  metalTexture.wrapS = metalTexture.wrapT = THREE.RepeatWrapping;
  metalTexture.repeat.set(5, 5);

  const boneTexture = makeNoiseTexture("#b89e75", "#3a160d", 384, 720, 0.24, "hide");
  boneTexture.wrapS = boneTexture.wrapT = THREE.RepeatWrapping;
  boneTexture.repeat.set(2, 2);

  const fleshTexture = makeNoiseTexture("#7f2519", "#1a0504", 384, 840, 0.32, "hide");
  fleshTexture.wrapS = fleshTexture.wrapT = THREE.RepeatWrapping;
  fleshTexture.repeat.set(2, 2);

  const wraithTexture = makeNoiseTexture("#34665c", "#071715", 384, 620, 0.26, "runes");
  wraithTexture.wrapS = wraithTexture.wrapT = THREE.RepeatWrapping;
  wraithTexture.repeat.set(2, 2);

  const floorTexture = makeFloorTexture();
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(4, 4);

  materials.floor = new THREE.MeshStandardMaterial({
    map: floorTexture,
    roughness: 0.86,
    metalness: 0.08,
    color: 0xb06d4b,
    emissive: 0x371008,
    emissiveIntensity: 0.48,
    side: THREE.DoubleSide
  });
  materials.floorLine = new THREE.MeshBasicMaterial({
    color: 0xc46d34,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  materials.floorRuneLine = new THREE.MeshBasicMaterial({
    color: 0x55e6c7,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  materials.floorStroke = new THREE.LineBasicMaterial({
    color: 0xd88a42,
    transparent: true,
    opacity: 0.62,
    depthWrite: false
  });
  materials.floorRuneStroke = new THREE.LineBasicMaterial({
    color: 0x55e6c7,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  materials.wall = new THREE.MeshStandardMaterial({
    map: stoneTexture,
    roughness: 0.93,
    metalness: 0.04,
    color: 0x655048,
    emissive: 0x120604,
    emissiveIntensity: 0.18
  });
  materials.metal = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: 0x57504a,
    emissive: 0x080604,
    emissiveIntensity: 0.12,
    roughness: 0.52,
    metalness: 0.76
  });
  materials.gold = new THREE.MeshStandardMaterial({
    color: 0xd79a3c,
    emissive: 0x2b0f06,
    roughness: 0.38,
    metalness: 0.86
  });
  materials.bone = new THREE.MeshStandardMaterial({
    map: boneTexture,
    color: 0xc4ae88,
    emissive: 0x1c0904,
    roughness: 0.7,
    metalness: 0.1
  });
  materials.flesh = new THREE.MeshStandardMaterial({
    map: fleshTexture,
    color: 0x612019,
    emissive: 0x220404,
    roughness: 0.78,
    metalness: 0.02
  });
  materials.wraith = new THREE.MeshStandardMaterial({
    map: wraithTexture,
    color: 0x5fb6a6,
    emissive: 0x0c695c,
    emissiveIntensity: 0.75,
    roughness: 0.58,
    metalness: 0.14
  });
  materials.lava = new THREE.MeshStandardMaterial({
    color: 0xff4a18,
    emissive: 0xff2b08,
    emissiveIntensity: 1.8,
    roughness: 0.42,
    metalness: 0
  });
  materials.rune = new THREE.MeshStandardMaterial({
    color: 0x74f1d2,
    emissive: 0x20c8a4,
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metalness: 0.2
  });
  materials.void = new THREE.MeshStandardMaterial({
    color: 0x7f63c7,
    emissive: 0x4b22a8,
    emissiveIntensity: 1.7,
    roughness: 0.32,
    metalness: 0.18
  });
  materials.jumpPad = new THREE.MeshStandardMaterial({
    color: 0x1f4d49,
    emissive: 0x35f6d0,
    emissiveIntensity: 1.25,
    roughness: 0.35,
    metalness: 0.72
  });
  materials.shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  });
  materials.sky = new THREE.MeshBasicMaterial({
    map: makeSkyTexture(),
    side: THREE.BackSide,
    fog: false,
    depthWrite: false
  });

  geometries.sky = new THREE.SphereGeometry(175, 64, 32);
  geometries.floor = new THREE.CircleGeometry(ARENA_RADIUS + 8, 96);
  geometries.wall = new THREE.BoxGeometry(5, 7, 2.2);
  geometries.tower = new THREE.CylinderGeometry(2.4, 3.1, 13, 8);
  geometries.spike = new THREE.ConeGeometry(0.32, 2.6, 6);
  geometries.enemyBody = new THREE.BoxGeometry(1.45, 2.0, 0.85);
  geometries.enemyHead = new THREE.BoxGeometry(0.84, 0.72, 0.84);
  geometries.enemyArm = new THREE.BoxGeometry(0.36, 1.35, 0.36);
  geometries.enemyLeg = new THREE.BoxGeometry(0.44, 1.25, 0.44);
  geometries.projectile = new THREE.SphereGeometry(0.16, 12, 8);
  geometries.enemyBolt = new THREE.OctahedronGeometry(0.32, 0);
  geometries.shield = new THREE.CylinderGeometry(0.76, 0.76, 0.16, 6);
  geometries.pickup = new THREE.DodecahedronGeometry(0.54, 0);
  geometries.jumpPad = new THREE.CylinderGeometry(1.8, 2.25, 0.34, 6);
  geometries.spark = new THREE.SphereGeometry(1, 6, 4);
  geometries.bloodDrop = new THREE.DodecahedronGeometry(1, 0);
  geometries.bloodSplat = new THREE.CircleGeometry(1, 12);
  geometries.scorch = new THREE.CircleGeometry(1, 16);
  geometries.weaponPickupCore = new THREE.BoxGeometry(0.82, 0.22, 0.42);
  geometries.weaponPickupBarrel = new THREE.CylinderGeometry(0.07, 0.11, 0.9, 8);
  geometries.weaponPickupRing = new THREE.TorusGeometry(0.32, 0.035, 8, 18);

  for (let i = 0; i < MAX_SPARK_POOL; i += 1) {
    sparkPool.push(new THREE.Mesh(geometries.spark, sparkMaterial(0xff5a1d)));
  }
  for (let i = 0; i < MAX_BLOOD_POOL; i += 1) {
    bloodPool.push(new THREE.Mesh(geometries.bloodDrop, bloodMaterial(0x7b0804)));
  }
}

function buildWorld() {
  addSkybox();
  scene.add(new THREE.HemisphereLight(0x8a5c4b, 0x160807, 1.25));

  const sun = new THREE.DirectionalLight(0xffc987, 1.15);
  sun.position.set(-16, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 90;
  scene.add(sun);

  const floor = new THREE.Mesh(geometries.floor, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);
  addArenaFloorMarks();
  addArenaGrid();

  const lavaRing = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_RADIUS + 0.8, ARENA_RADIUS + 6.2, 96),
    materials.lava
  );
  lavaRing.rotation.x = -Math.PI / 2;
  lavaRing.position.y = -0.05;
  scene.add(lavaRing);

  addArenaWalls();
  addCentralForge();
  addTorches();
  addJumpPads();
  addSkyChains();
  createWeaponRig();
  createEmbers();
}

function addSkybox() {
  const sky = new THREE.Mesh(geometries.sky, materials.sky);
  sky.name = "skybox";
  sky.renderOrder = -1000;
  scene.add(sky);
}

function addArenaFloorMarks() {
  for (const radius of [8, 16, 24, 32, 40]) {
    const points = [];
    for (let i = 0; i <= 128; i += 1) {
      const angle = (i / 128) * Math.PI * 2;
      points.push(Math.sin(angle) * radius, 0.06, Math.cos(angle) * radius);
    }
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3)),
      radius === 16 || radius === 32 ? materials.floorRuneStroke : materials.floorStroke
    );
    scene.add(ring);
  }

  const spokePoints = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI;
    const x = Math.sin(angle) * ARENA_RADIUS * 0.92;
    const z = Math.cos(angle) * ARENA_RADIUS * 0.92;
    spokePoints.push(-x, 0.06, -z, x, 0.06, z);
  }
  const spokes = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(spokePoints, 3)),
    materials.floorStroke
  );
  scene.add(spokes);
}

function addArenaGrid() {
  const grid = new THREE.GridHelper(ARENA_RADIUS * 2, 32, 0x55e6c7, 0xc46d34);
  grid.position.y = 0.075;
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  grid.material.depthWrite = false;
  grid.renderOrder = 2;
  scene.add(grid);
}

function addJumpPads() {
  const positions = [
    { x: 0, z: 30, yaw: Math.PI },
    { x: 26, z: 14, yaw: -2.35 },
    { x: -26, z: 14, yaw: 2.35 },
    { x: 24, z: -20, yaw: -0.75 },
    { x: -24, z: -20, yaw: 0.75 }
  ];

  for (const pad of positions) {
    const group = new THREE.Group();
    group.position.set(pad.x, 0.18, pad.z);
    group.rotation.y = pad.yaw;

    const base = new THREE.Mesh(geometries.jumpPad, materials.jumpPad);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.055, 6, 24), materials.rune);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.23;
    group.add(ring);

    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 3), materials.gold);
    arrow.position.set(0, 0.44, -0.3);
    arrow.rotation.x = Math.PI / 2;
    group.add(arrow);

    const light = new THREE.PointLight(0x35f6d0, 1.8, 10, 2);
    light.position.y = 1.2;
    group.add(light);

    scene.add(group);
    jumpPads.push({
      group,
      x: pad.x,
      z: pad.z,
      yaw: pad.yaw,
      radius: 2.4,
      cooldown: 0
    });
  }
}

function addArenaWalls() {
  const count = 24;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const radius = ARENA_RADIUS + 2.2;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    const wall = new THREE.Mesh(geometries.wall, materials.wall);
    wall.position.set(x, 3.3, z);
    wall.rotation.y = angle;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    if (i % 3 === 0) {
      const tower = new THREE.Mesh(geometries.tower, materials.wall);
      tower.position.set(Math.sin(angle) * (radius + 1.1), 6.2, Math.cos(angle) * (radius + 1.1));
      tower.rotation.y = angle * 0.5;
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);
    }

    if (i % 2 === 0) {
      for (let s = -1; s <= 1; s += 2) {
        const spike = new THREE.Mesh(geometries.spike, materials.metal);
        spike.position.set(
          Math.sin(angle + s * 0.025) * (radius - 0.3),
          8.2,
          Math.cos(angle + s * 0.025) * (radius - 0.3)
        );
        spike.rotation.z = Math.PI;
        spike.rotation.y = angle;
        spike.castShadow = true;
        scene.add(spike);
      }
    }
  }
}

function addCentralForge() {
  const altar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 1.2, 8), materials.wall);
  base.position.y = 0.6;
  base.castShadow = true;
  base.receiveShadow = true;
  altar.add(base);

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.5, 0.7, 8), materials.metal);
  crown.position.y = 1.55;
  crown.castShadow = true;
  altar.add(crown);

  const flame = new THREE.PointLight(0xff4519, 5.2, 23, 2);
  flame.position.y = 3.1;
  altar.add(flame);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), materials.lava);
  core.position.y = 2.6;
  core.name = "forgeCore";
  altar.add(core);
  scene.add(altar);
}

function addTorches() {
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.sin(angle) * 31;
    const z = Math.cos(angle) * 31;

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 3.4, 6), materials.metal);
    mast.position.set(x, 1.7, z);
    mast.castShadow = true;
    scene.add(mast);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.34, 0.38, 8), materials.gold);
    bowl.position.set(x, 3.48, z);
    bowl.castShadow = true;
    scene.add(bowl);

    const light = new THREE.PointLight(0xff5a1d, 2.7, 16, 2);
    light.position.set(x, 3.75, z);
    scene.add(light);

    hazards.push({ angle, light, pulse: Math.random() * Math.PI * 2 });
  }
}

function addSkyChains() {
  for (let i = 0; i < 8; i += 1) {
    const chain = new THREE.Group();
    const angle = (i / 8) * Math.PI * 2;
    const radius = 18 + (i % 2) * 9;
    chain.position.set(Math.sin(angle) * radius, 13 + (i % 3), Math.cos(angle) * radius);
    chain.rotation.y = angle;
    for (let j = 0; j < 8; j += 1) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 12), materials.metal);
      link.position.y = -j * 0.62;
      link.rotation.x = j % 2 ? Math.PI / 2 : 0;
      link.castShadow = true;
      chain.add(link);
    }
    scene.add(chain);
  }
}

function createWeaponRig() {
  weaponRig = new THREE.Group();
  weaponRig.scale.setScalar(0.46);
  weaponRig.position.copy(WEAPON_BASE_POSITION);
  camera.add(weaponRig);

  weaponModels = WEAPONS.map((weapon, index) => {
    const model = createWeaponModel(index, weapon);
    model.visible = index === state.weaponIndex;
    weaponRig.add(model);
    return model;
  });

  shieldMesh = new THREE.Group();
  const disc = new THREE.Mesh(geometries.shield, materials.metal);
  disc.rotation.x = Math.PI / 2;
  shieldMesh.add(disc);
  for (let i = 0; i < 6; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.92), materials.gold);
    blade.position.set(Math.sin((i / 6) * Math.PI * 2) * 0.46, 0, Math.cos((i / 6) * Math.PI * 2) * 0.46);
    blade.rotation.y = (i / 6) * Math.PI * 2;
    shieldMesh.add(blade);
  }
  shieldMesh.position.set(-0.78, -0.68, -1.18);
  shieldMesh.rotation.set(-0.28, 0.18, -0.3);
  weaponRig.add(shieldMesh);

  muzzleLight = new THREE.PointLight(0x57ffd7, 0, 8, 2);
  muzzleLight.position.set(0.42, -0.28, -1.48);
  weaponRig.add(muzzleLight);
}

function weaponMaterial(weapon) {
  if (weapon.color === 0xff4a18) return materials.lava;
  if (weapon.color === 0xb48cff) return materials.void;
  if (weapon.color === 0xffc06b || weapon.color === 0xffef9a) return materials.gold;
  return materials.rune;
}

function createWeaponModel(index, weapon) {
  const group = new THREE.Group();
  const glowMat = weaponMaterial(weapon);
  const metal = materials.metal;
  const gold = materials.gold;

  const addBox = (size, pos, mat = metal) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const addBarrel = (radius, length, pos, mat = metal) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius, length, 10), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (index === 0) {
    addBox([0.62, 0.36, 0.78], [0.42, -0.55, -0.62], gold);
    addBarrel(0.16, 1.25, [0.42, -0.52, -1.18]);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), glowMat);
    rune.position.set(0.42, -0.52, -1.78);
    rune.rotation.x = Math.PI / 2;
    group.add(rune);
  } else if (index === 1) {
    addBox([0.72, 0.42, 0.54], [0.42, -0.56, -0.65], gold);
    for (let i = -1; i <= 1; i += 1) addBarrel(0.095, 1.0, [0.42 + i * 0.15, -0.5, -1.13]);
    addBox([0.96, 0.08, 0.22], [0.42, -0.28, -0.82], glowMat);
  } else if (index === 2) {
    addBox([0.44, 0.34, 0.94], [0.48, -0.55, -0.72], metal);
    addBarrel(0.085, 1.45, [0.48, -0.5, -1.32], glowMat);
    for (let i = 0; i < 4; i += 1) addBox([0.08, 0.22, 0.18], [0.28 + i * 0.13, -0.34, -0.72], gold);
  } else if (index === 3) {
    addBox([0.48, 0.3, 1.25], [0.42, -0.55, -0.8], gold);
    addBarrel(0.09, 1.8, [0.42, -0.48, -1.55], glowMat);
    const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glowMat);
    prism.position.set(0.42, -0.48, -2.35);
    group.add(prism);
  } else if (index === 4) {
    addBox([0.82, 0.54, 0.72], [0.4, -0.58, -0.66], metal);
    addBarrel(0.28, 0.96, [0.4, -0.52, -1.1], gold);
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), glowMat);
    skull.position.set(0.4, -0.26, -0.74);
    group.add(skull);
  } else if (index === 5) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 6), glowMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0.34, -0.5, -1.0);
    group.add(disc);
    addBox([0.36, 0.26, 0.82], [0.5, -0.62, -0.58], metal);
    for (let i = 0; i < 6; i += 1) {
      const blade = addBox([0.08, 0.04, 0.46], [0.34, -0.5, -1.0], gold);
      blade.rotation.y = (i / 6) * Math.PI * 2;
      blade.position.x += Math.sin(blade.rotation.y) * 0.3;
      blade.position.z += Math.cos(blade.rotation.y) * 0.3;
    }
  } else {
    addBox([0.46, 0.3, 1.0], [0.46, -0.55, -0.72], materials.void);
    for (let i = 0; i < 3; i += 1) addBarrel(0.065, 1.1, [0.32 + i * 0.13, -0.5, -1.25], metal);
    addBox([0.66, 0.07, 0.24], [0.46, -0.31, -0.86], glowMat);
  }

  return group;
}

function createEmbers() {
  const emberGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(420 * 3);
  const colors = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 47;
    positions[i * 3] = Math.sin(angle) * radius;
    positions[i * 3 + 1] = Math.random() * 18 + 3.0;
    positions[i * 3 + 2] = Math.cos(angle) * radius;
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.24 + Math.random() * 0.4;
    colors[i * 3 + 2] = 0.05;
    embers.push({ speed: 0.24 + Math.random() * 0.9, phase: Math.random() * 9 });
  }
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  emberGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const emberMaterial = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending
  });
  const emberCloud = new THREE.Points(emberGeometry, emberMaterial);
  emberCloud.name = "emberCloud";
  scene.add(emberCloud);
}

function bindEvents() {
  startButton.addEventListener("click", () => {
    if (!state.alive) {
      restart();
    } else {
      startGame();
    }
  });
  createRoomButton.addEventListener("click", () => {
    if (isLobbyHidden()) return;
    createNetworkRoom();
  });
  refreshRoomsButton.addEventListener("click", () => {
    if (isLobbyHidden()) return;
    requestRoomList();
  });

  document.addEventListener("keydown", (event) => {
    if (isTextEntryActive(event.target)) return;
    if (event.code === "Backquote" || event.key === "`" || event.key === "~" || event.key === "ё" || event.key === "Ё") {
      event.preventDefault();
      toggleConsole();
      return;
    }
    if (state.consoleOpen) return;
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === "KeyR" && state.alive && state.ammo < AMMO_MAX) {
      state.ammo = Math.min(AMMO_MAX, state.ammo + 35);
    }
    const weaponNumber = getWeaponNumber(event);
    if (weaponNumber) {
      event.preventDefault();
      selectWeapon(weaponNumber - 1);
    }
    if (event.code === "Space") {
      if (state.started) event.preventDefault();
      jump();
    }
    if (event.code === "KeyQ") {
      throwShield();
    }
    if (event.code === "Enter" && !state.alive) {
      restart();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (!isTextEntryActive(event.target) && state.started && event.code === "Space") {
      event.preventDefault();
    }
    keys.delete(event.code);
  });

  consoleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runConsoleCommand(consoleInput.value);
    consoleInput.value = "";
  });

  document.addEventListener("mousedown", (event) => {
    if (!state.started || !state.alive) return;
    if (!controls.isLocked && !isTouchDevice()) {
      controls.lock();
      return;
    }
    if (event.button === 0) fire();
    if (event.button === 2) throwShield();
  });

  document.addEventListener("contextmenu", (event) => event.preventDefault());

  controls.addEventListener("lock", () => {
    overlay.classList.add("hidden");
  });

  controls.addEventListener("unlock", () => {
    if (state.alive && state.started && !isTouchDevice() && !state.consoleOpen) {
      overlay.classList.remove("hidden");
      startButton.textContent = "Return to Battle";
    }
  });

  touchFire.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.touchFireHeld = true;
    startGame();
  });
  touchFire.addEventListener("pointerup", () => {
    state.touchFireHeld = false;
  });
  touchFire.addEventListener("pointercancel", () => {
    state.touchFireHeld = false;
  });
  touchShield.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startGame();
    throwShield();
  });

  stickBase.addEventListener("pointerdown", (event) => {
    input.stickPointer = event.pointerId;
    stickBase.setPointerCapture(event.pointerId);
    updateStick(event);
    startGame();
  });
  stickBase.addEventListener("pointermove", (event) => {
    if (input.stickPointer === event.pointerId) updateStick(event);
  });
  stickBase.addEventListener("pointerup", resetStick);
  stickBase.addEventListener("pointercancel", resetStick);

  window.addEventListener("pointerdown", (event) => {
    if (!isTouchDevice() || event.target.closest("button") || event.target === stickBase) return;
    if (event.clientX > window.innerWidth * 0.35) {
      input.lookPointer = event.pointerId;
      input.lastLookX = event.clientX;
      input.lastLookY = event.clientY;
      state.touchLookActive = true;
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (input.lookPointer !== event.pointerId || !state.touchLookActive) return;
    const dx = event.clientX - input.lastLookX;
    const dy = event.clientY - input.lastLookY;
    input.lastLookX = event.clientX;
    input.lastLookY = event.clientY;
    controls.getObject().rotation.y -= dx * 0.0032;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0032, -1.15, 1.05);
  });

  window.addEventListener("pointerup", (event) => {
    if (input.lookPointer === event.pointerId) {
      state.touchLookActive = false;
      input.lookPointer = null;
    }
  });

  window.addEventListener("resize", onResize);
}

function isTextEntryActive(target) {
  const element = target instanceof HTMLElement ? target : document.activeElement;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function isLobbyHidden() {
  return overlay.classList.contains("hidden");
}

function releaseMenuFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && overlay.contains(active)) {
    active.blur();
  }
}

function initNetwork() {
  network.statusEl = document.createElement("div");
  network.statusEl.className = "net-status";
  network.statusEl.textContent = "NET OFF";
  document.querySelector("#app").appendChild(network.statusEl);
  renderRoomList();
  updateRoomStatus();

  if (!("WebSocket" in window)) {
    network.statusEl.textContent = "NET NO WS";
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname || "127.0.0.1";
  const wsUrl =
    window.location.port === "5173"
      ? `${protocol}://${host}:5174`
      : `${protocol}://${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);
  network.socket = socket;

  socket.addEventListener("open", () => {
    network.connected = true;
    network.statusEl.textContent = "NET CONNECTED";
    requestRoomList();
    updateRoomStatus();
  });
  socket.addEventListener("close", () => {
    network.connected = false;
    network.roomId = null;
    network.roomName = "";
    network.hostId = null;
    network.statusEl.textContent = "NET OFFLINE";
    for (const peer of network.peers.values()) scene.remove(peer.group);
    network.peers.clear();
    renderRoomList();
    updateRoomStatus();
  });
  socket.addEventListener("message", (event) => {
    try {
      handleNetworkMessage(JSON.parse(event.data));
    } catch {
      network.statusEl.textContent = "NET BAD PACKET";
    }
  });
}

function handleNetworkMessage(message) {
  if (message.type === "welcome") {
    network.id = message.id;
    network.statusEl.textContent = `NET #${message.id}`;
    updateRoomStatus();
    return;
  }
  if (message.type === "room-list") {
    network.rooms = message.rooms ?? [];
    renderRoomList();
    return;
  }
  if (message.type === "room-joined") {
    network.roomId = message.room?.id ?? null;
    network.roomName = message.room?.name ?? "";
    network.hostId = message.room?.hostId ?? network.id;
    network.playerName = message.playerName ?? getPlayerName();
    playerNameInput.value = network.playerName;
    network.seed = message.room?.seed ?? 1;
    for (const peer of network.peers.values()) scene.remove(peer.group);
    network.peers.clear();
    resetRoomGame(network.seed);
    network.statusEl.textContent = network.roomName ? `ROOM ${network.roomName}` : `NET #${network.id}`;
    updateRoomStatus();
    requestRoomList();
    startGame();
    return;
  }
  if (message.type === "room-left") {
    network.roomId = null;
    network.roomName = "";
    network.hostId = null;
    for (const peer of network.peers.values()) scene.remove(peer.group);
    network.peers.clear();
    updateRoomStatus();
    requestRoomList();
    return;
  }
  if (message.type === "room-error") {
    roomStatus.textContent = message.message ?? "Room error";
    return;
  }
  if (message.type === "host-changed") {
    network.hostId = message.hostId ?? network.hostId;
    network.statusEl.textContent = isEnemyHost() ? "NET HOST" : `HOST P${network.hostId}`;
    if (isEnemyHost() && state.started && enemies.length === 0 && spawnQueue.length === 0 && state.wave === 1 && state.kills === 0) {
      spawnWave();
    }
    return;
  }
  if (!message.id || message.id === network.id) return;
  if (message.type === "peer-leave") {
    const peer = network.peers.get(message.id);
    if (peer) scene.remove(peer.group);
    network.peers.delete(message.id);
    return;
  }
  if (message.type === "peer-join") {
    const peer = network.peers.get(message.id) ?? createRemotePlayer(message.id);
    peer.playerName = message.playerName || `P${message.id}`;
    network.peers.set(message.id, peer);
    if (!peer.group.parent) scene.add(peer.group);
    drawPeerLabel(peer);
    return;
  }
  if (message.type === "state") {
    let peer = network.peers.get(message.id);
    let isNewPeer = false;
    if (!peer) {
      peer = createRemotePlayer(message.id);
      network.peers.set(message.id, peer);
      scene.add(peer.group);
      isNewPeer = true;
    }
    peer.playerName = message.playerName || peer.playerName || `P${message.id}`;
    peer.targetPosition.set(message.x ?? 0, (message.y ?? PLAYER_HEIGHT) - PLAYER_HEIGHT, message.z ?? 0);
    if (isNewPeer) {
      peer.group.position.copy(peer.targetPosition);
      peer.lastPosition.copy(peer.targetPosition);
    }
    const fallbackRotation = Number.isFinite(message.ry) ? message.ry : peer.targetRotation;
    const rawTargetRotation = lookAngle(message.lx, message.lz, fallbackRotation - Math.PI) + Math.PI;
    peer.targetRotation = unwrapAngle(peer.targetRotation, rawTargetRotation);
    const visualRotationError = Math.abs(
      THREE.MathUtils.euclideanModulo(peer.targetRotation - peer.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI
    );
    if (isNewPeer || visualRotationError > 1) peer.group.rotation.y = peer.targetRotation;
    peer.weaponIndex = message.weaponIndex ?? 0;
    return;
  }
  if (message.type === "fire") {
    spawnRemoteShot(message);
    return;
  }
  if (message.type === "enemy-state") {
    applyEnemyState(message);
  }
}

function requestRoomList() {
  sendNetworkMessage({ type: "list-rooms" });
}

function getPlayerName() {
  const name = (playerNameInput.value || "Slayer").trim().replace(/\s+/g, " ").slice(0, 20) || "Slayer";
  playerNameInput.value = name;
  network.playerName = name;
  return name;
}

function createNetworkRoom() {
  if (!network.connected) {
    roomStatus.textContent = "Network server is offline. Start start.bat or npm run net.";
    return;
  }
  sendNetworkMessage({
    type: "create-room",
    name: roomNameInput.value || "Iron Arena",
    playerName: getPlayerName()
  });
}

function joinNetworkRoom(roomId) {
  if (isLobbyHidden()) return;
  if (!network.connected) {
    roomStatus.textContent = "Network server is offline.";
    return;
  }
  sendNetworkMessage({ type: "join-room", roomId, playerName: getPlayerName() });
}

function updateRoomStatus() {
  if (!network.connected) {
    roomStatus.textContent = "Network offline. You can play solo, or start the WebSocket server.";
    return;
  }
  if (network.roomId) {
    roomStatus.textContent = `Connected to "${network.roomName}" as ${network.playerName}. Battle is live in this room.`;
    return;
  }
  roomStatus.textContent = `Connected as ${getPlayerName()}. Create or join a room, or press Enter the Citadel for solo.`;
}

function renderRoomList() {
  roomList.textContent = "";
  if (!network.connected) {
    const empty = document.createElement("div");
    empty.className = "room-empty";
    empty.textContent = "Multiplayer server offline.";
    roomList.appendChild(empty);
    return;
  }
  if (!network.rooms.length) {
    const empty = document.createElement("div");
    empty.className = "room-empty";
    empty.textContent = "No games yet. Create one.";
    roomList.appendChild(empty);
    return;
  }
  for (const room of network.rooms) {
    const card = document.createElement("div");
    card.className = "room-card";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = room.name;
    const meta = document.createElement("span");
    meta.textContent = `${room.players} player${room.players === 1 ? "" : "s"} • room #${room.id}`;
    info.append(title, meta);

    const stateLabel = document.createElement("span");
    stateLabel.textContent = network.roomId === room.id ? "JOINED" : "OPEN";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = network.roomId === room.id ? "Joined" : "Join";
    button.disabled = network.roomId === room.id;
    button.addEventListener("click", () => joinNetworkRoom(room.id));

    card.append(info, stateLabel, button);
    roomList.appendChild(card);
  }
}

function setGameSeed(seed) {
  gameSeed = Math.max(1, Number(seed) || 1) >>> 0;
}

function isEnemyHost() {
  return !network.roomId || network.hostId === network.id;
}

function dampAngle(current, target, lambda, delta) {
  const diff = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + diff * (1 - Math.exp(-lambda * delta));
}

function unwrapAngle(reference, angle) {
  const diff = THREE.MathUtils.euclideanModulo(angle - reference + Math.PI, Math.PI * 2) - Math.PI;
  return reference + diff;
}

function lookAngle(lookX, lookZ, fallback) {
  if (Number.isFinite(lookX) && Number.isFinite(lookZ) && Math.hypot(lookX, lookZ) > 0.001) {
    return Math.atan2(lookX, lookZ);
  }
  return fallback;
}

function gameRandom() {
  gameSeed = (gameSeed * 1664525 + 1013904223) >>> 0;
  return gameSeed / 4294967296;
}

function resetRoomGame(seed) {
  setGameSeed(seed);
  state.alive = true;
  state.health = 100;
  state.armor = 75;
  state.ammo = AMMO_MAX;
  state.wave = 1;
  state.kills = 0;
  state.nextWaveAt = 0;
  state.fireCooldown = 0;
  state.shieldCooldown = 0;
  state.verticalVelocity = 0;
  state.jumpOffset = 0;
  state.grounded = true;
  nextEnemyId = 1;
  controls.getObject().position.set(0, PLAYER_HEIGHT, 18);
  spawnQueue.length = 0;
  spawnDripTimer = 0;
  enemiesById.clear();
  enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
  projectiles.splice(0).forEach((shot) => scene.remove(shot.mesh));
  enemyBolts.splice(0).forEach((shot) => scene.remove(shot.mesh));
  pickups.splice(0).forEach((pickup) => scene.remove(pickup.mesh));
  sparks.splice(0).forEach((spark) => releaseSpark(spark.mesh));
  bloodDrops.splice(0).forEach((drop) => releaseBloodDrop(drop.mesh));
  clearRagdolls();
  decals.splice(0).forEach((decal) => {
    scene.remove(decal.mesh);
    decal.mesh.material.dispose();
  });
  if (isEnemyHost()) spawnWave();
}

function createRemotePlayer(id) {
  const group = new THREE.Group();
  const limbs = { arms: [], legs: [] };
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.25, 0.48), materials.metal);
  body.position.y = 1.1;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.12), materials.lava);
  chest.position.set(0, 1.42, -0.3);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.48, 0.5), materials.gold);
  head.position.y = 2.0;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.055), materials.rune);
  visor.position.set(0, 2.05, -0.285);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 4), materials.rune);
  nose.position.set(0, 1.92, -0.42);
  nose.rotation.x = -Math.PI / 2;
  for (let side = -1; side <= 1; side += 2) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), materials.bone);
    arm.position.set(side * 0.55, 1.22, 0.02);
    arm.castShadow = true;
    group.add(arm);
    limbs.arms.push({ mesh: arm, side, baseY: arm.position.y, baseZ: arm.position.z });

    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 0.2), materials.metal);
    leg.position.set(side * 0.22, 0.34, 0.04);
    leg.castShadow = true;
    group.add(leg);
    limbs.legs.push({ mesh: leg, side, baseY: leg.position.y, baseZ: leg.position.z });
  }
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), materials.rune);
  weapon.position.set(0.58, 1.26, -0.44);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.1), materials.gold);
  muzzle.position.set(0.58, 1.26, -0.94);
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 128;
  labelCanvas.height = 32;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
  label.position.y = 2.75;
  label.scale.set(1.8, 0.45, 1);
  group.add(body, chest, head, visor, nose, weapon, muzzle, label);
  return {
    id,
    group,
    body,
    head,
    weapon,
    muzzle,
    limbs,
    bodyBaseY: body.position.y,
    headBaseY: head.position.y,
    label,
    labelCanvas,
    labelTexture,
    targetPosition: new THREE.Vector3(),
    lastPosition: new THREE.Vector3(),
    targetRotation: 0,
    walkPhase: 0,
    moveSpeed: 0,
    weaponIndex: 0,
    playerName: `P${id}`
  };
}

function drawPeerLabel(peer) {
  const ctx = peer.labelCanvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 32);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#55e6c7";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(peer.playerName || `P${peer.id}`, 64, 22);
  peer.labelTexture.needsUpdate = true;
}

function animateRemotePlayer(peer, delta) {
  const moveAmount = THREE.MathUtils.clamp(peer.moveSpeed / 5.5, 0, 1);
  peer.walkPhase += delta * (4.5 + peer.moveSpeed * 1.4) * (0.25 + moveAmount);
  const phase = peer.walkPhase;
  const stride = moveAmount * 0.85;
  const bounce = Math.abs(Math.sin(phase)) * moveAmount;

  peer.body.position.y = THREE.MathUtils.damp(peer.body.position.y, peer.bodyBaseY + bounce * 0.055, 16, delta);
  peer.body.rotation.z = THREE.MathUtils.damp(peer.body.rotation.z, Math.sin(phase * 0.5) * moveAmount * 0.05, 12, delta);
  peer.head.position.y = THREE.MathUtils.damp(peer.head.position.y, peer.headBaseY + bounce * 0.035, 16, delta);

  for (const leg of peer.limbs.legs) {
    const cycle = Math.sin(phase + (leg.side > 0 ? 0 : Math.PI));
    const lift = Math.max(0, -Math.cos(phase + (leg.side > 0 ? 0 : Math.PI))) * moveAmount;
    leg.mesh.rotation.x = THREE.MathUtils.damp(leg.mesh.rotation.x, cycle * stride, 18, delta);
    leg.mesh.rotation.z = THREE.MathUtils.damp(leg.mesh.rotation.z, -leg.side * moveAmount * 0.05, 14, delta);
    leg.mesh.position.y = THREE.MathUtils.damp(leg.mesh.position.y, leg.baseY + lift * 0.08, 18, delta);
    leg.mesh.position.z = THREE.MathUtils.damp(leg.mesh.position.z, leg.baseZ - cycle * moveAmount * 0.08, 18, delta);
  }

  for (const arm of peer.limbs.arms) {
    const cycle = Math.sin(phase + (arm.side > 0 ? Math.PI : 0));
    arm.mesh.rotation.x = THREE.MathUtils.damp(arm.mesh.rotation.x, cycle * stride * 0.7, 16, delta);
    arm.mesh.rotation.z = THREE.MathUtils.damp(arm.mesh.rotation.z, arm.side * (0.1 + moveAmount * 0.12), 14, delta);
    arm.mesh.position.y = THREE.MathUtils.damp(arm.mesh.position.y, arm.baseY + bounce * 0.025, 14, delta);
  }

  const weaponBob = Math.sin(phase + Math.PI) * moveAmount;
  peer.weapon.rotation.x = THREE.MathUtils.damp(peer.weapon.rotation.x, weaponBob * 0.18, 14, delta);
  peer.weapon.position.y = THREE.MathUtils.damp(peer.weapon.position.y, 1.26 + bounce * 0.035, 14, delta);
  peer.muzzle.rotation.copy(peer.weapon.rotation);
  peer.muzzle.position.y = peer.weapon.position.y;
}

function applyEnemyState(message) {
  if (isEnemyHost()) return;
  state.wave = message.wave ?? state.wave;
  state.kills = message.kills ?? state.kills;

  const seen = new Set();
  for (const snapshot of message.enemies ?? []) {
    const id = String(snapshot.id);
    seen.add(id);
    let enemy = enemiesById.get(id);
    let isNewEnemy = false;
    if (!enemy) {
      enemy = createEnemy(snapshot.type ?? "raider");
      enemy.netId = id;
      enemiesById.set(id, enemy);
      enemies.push(enemy);
      scene.add(enemy.group);
      isNewEnemy = true;
    }
    enemy.health = snapshot.health ?? enemy.health;
    enemy.spawnProgress = snapshot.spawnProgress ?? 1;
    enemy.group.position.set(snapshot.x ?? 0, snapshot.y ?? 0.08, snapshot.z ?? 0);
    if (isNewEnemy) enemy.lastPosition.copy(enemy.group.position);
    enemy.group.rotation.y = snapshot.ry ?? enemy.group.rotation.y;
    enemy.group.scale.setScalar(snapshot.scale ?? 1);
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (!seen.has(String(enemy.netId))) {
      spawnEnemyRagdoll(enemy, 0.82);
      scene.remove(enemy.group);
      enemiesById.delete(String(enemy.netId));
      enemies.splice(i, 1);
    }
  }
}

function sendEnemyState() {
  if (!network.roomId || !isEnemyHost()) return;
  sendNetworkMessage({
    type: "enemy-state",
    wave: state.wave,
    kills: state.kills,
    enemies: enemies.map((enemy) => ({
      id: enemy.netId,
      type: enemy.type,
      x: enemy.group.position.x,
      y: enemy.group.position.y,
      z: enemy.group.position.z,
      ry: enemy.group.rotation.y,
      scale: enemy.group.scale.x,
      health: enemy.health,
      spawnProgress: enemy.spawnProgress
    }))
  });
}

function sendNetworkMessage(payload) {
  if (network.socket?.readyState === WebSocket.OPEN) {
    network.socket.send(JSON.stringify(payload));
  }
}

function updateNetwork(delta) {
  for (const peer of network.peers.values()) {
    const previousPosition = peer.group.position.clone();
    peer.group.position.lerp(peer.targetPosition, 1 - Math.pow(0.001, delta));
    peer.moveSpeed = previousPosition.distanceTo(peer.group.position) / Math.max(delta, 0.001);
    peer.group.rotation.y = dampAngle(peer.group.rotation.y, peer.targetRotation, 45, delta);
    peer.weapon.material = weaponMaterial(WEAPONS[peer.weaponIndex] ?? WEAPONS[0]);
    animateRemotePlayer(peer, delta);
    peer.lastPosition.copy(peer.group.position);
    drawPeerLabel(peer);
  }

  for (let i = remoteProjectiles.length - 1; i >= 0; i -= 1) {
    const shot = remoteProjectiles[i];
    shot.ttl -= delta;
    shot.mesh.position.addScaledVector(shot.velocity, delta);
    shot.mesh.rotation.y += delta * 12;
    if (shot.ttl <= 0) {
      scene.remove(shot.mesh);
      remoteProjectiles.splice(i, 1);
    }
  }

  network.lastEnemySend += delta;
  if (network.roomId && isEnemyHost() && network.lastEnemySend >= 0.1) {
    network.lastEnemySend = 0;
    sendEnemyState();
  }

  network.lastSend += delta;
  if (!network.connected || !network.roomId || network.lastSend < 0.05 || !state.started) return;
  network.lastSend = 0;
  const pos = controls.getObject().position;
  const lookYaw = controls.getObject().rotation.y - Math.PI;
  sendNetworkMessage({
    type: "state",
    x: pos.x,
    y: pos.y,
    z: pos.z,
    ry: controls.getObject().rotation.y,
    lx: Math.sin(lookYaw),
    lz: Math.cos(lookYaw),
    weaponIndex: state.weaponIndex,
    playerName: getPlayerName()
  });
}

function spawnRemoteShot(message) {
  const weapon = WEAPONS[message.weaponIndex] ?? WEAPONS[0];
  const mat = weaponMaterial(weapon);
  const mesh = weapon.disc
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 6), mat)
    : new THREE.Mesh(geometries.projectile, mat);
  const dir = new THREE.Vector3(message.dx ?? 0, message.dy ?? 0, message.dz ?? -1).normalize();
  mesh.position.set(message.x ?? 0, message.y ?? PLAYER_HEIGHT, message.z ?? 0).addScaledVector(dir, 1.2);
  mesh.scale.setScalar(weapon.size);
  scene.add(mesh);
  remoteProjectiles.push({ mesh, velocity: dir.multiplyScalar(weapon.speed), ttl: Math.min(weapon.ttl, 1.2) });
  spawnMuzzleSparks(mesh.position, dir, 10, weapon.color);
}

function startGame() {
  releaseMenuFocus();
  if (!state.started) {
    state.started = true;
    if (!network.roomId && isEnemyHost() && enemies.length === 0 && spawnQueue.length === 0 && state.wave === 1 && state.kills === 0) {
      spawnWave();
    }
    overlay.classList.add("hidden");
  }
  if (!isTouchDevice() && !controls.isLocked) controls.lock();
}

function getWeaponNumber(event) {
  if (event.code.startsWith("Digit")) return Number(event.code.slice(5));
  if (event.code.startsWith("Numpad")) return Number(event.code.slice(6));
  if (/^[1-7]$/.test(event.key)) return Number(event.key);
  return 0;
}

function toggleConsole(force) {
  state.consoleOpen = typeof force === "boolean" ? force : !state.consoleOpen;
  cheatConsole.classList.toggle("hidden", !state.consoleOpen);
  if (state.consoleOpen) {
    overlay.classList.add("hidden");
    if (controls.isLocked) controls.unlock();
    logConsole("Type help for cheats.", "ok");
    window.setTimeout(() => consoleInput.focus(), 0);
  } else {
    consoleInput.blur();
    if (state.started && state.alive && !isTouchDevice()) controls.lock();
  }
}

function logConsole(message, tone = "") {
  const line = document.createElement("div");
  if (tone) line.className = tone;
  line.textContent = message;
  consoleLog.appendChild(line);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

function runConsoleCommand(rawCommand) {
  const raw = rawCommand.trim();
  if (!raw) return;
  logConsole(`> ${raw}`);
  const [command, ...args] = raw.toLowerCase().split(/\s+/);

  if (command === "help") {
    logConsole("god, ammo, guns, weapon 1-7, all, heal, armor, killall, wave N", "ok");
    logConsole("spawn TYPE N, types, nocd, infammo, megajump, drop, clear, close", "ok");
    return;
  }
  if (command === "types") {
    logConsole(`monster types: ${ENEMY_TYPES.join(", ")}`, "ok");
    return;
  }
  if (command === "clear") {
    consoleLog.textContent = "";
    return;
  }
  if (command === "close" || command === "exit") {
    toggleConsole(false);
    return;
  }
  if (command === "god") {
    state.godMode = !state.godMode;
    logConsole(`god mode ${state.godMode ? "on" : "off"}`, "ok");
    return;
  }
  if (command === "ammo" || command === "maxammo") {
    state.ammo = AMMO_MAX;
    logConsole(`ammo ${AMMO_MAX}`, "ok");
    return;
  }
  if (command === "guns" || command === "allguns") {
    state.ownedWeapons = WEAPONS.map(() => true);
    state.ammo = AMMO_MAX;
    logConsole("all weapons unlocked, ammo filled", "ok");
    return;
  }
  if (command === "all") {
    state.ownedWeapons = WEAPONS.map(() => true);
    state.ammo = AMMO_MAX;
    state.health = 100;
    state.armor = 100;
    state.godMode = true;
    logConsole("full kit: guns, ammo, health, armor, god", "ok");
    return;
  }
  if (command === "weapon" || command === "w") {
    const index = Number(args[0]) - 1;
    selectWeapon(index, true);
    logConsole(`weapon ${state.weaponIndex + 1}: ${WEAPONS[state.weaponIndex].name}`, "ok");
    return;
  }
  if (command === "heal" || command === "health") {
    state.health = 100;
    logConsole("health full", "ok");
    return;
  }
  if (command === "armor") {
    state.armor = 100;
    logConsole("armor full", "ok");
    return;
  }
  if (command === "killall") {
    spawnQueue.length = 0;
    spawnDripTimer = 0;
    enemies.splice(0).forEach((enemy) => {
      spawnEnemyRagdoll(enemy, 1.15);
      makeScorch(enemy.group.position, 0xff4a18);
      scene.remove(enemy.group);
      enemiesById.delete(String(enemy.netId));
      state.kills += 1;
    });
    logConsole("all monsters removed", "ok");
    return;
  }
  if (command === "wave") {
    const wave = Math.max(1, Math.min(99, Number(args[0]) || state.wave));
    state.wave = wave;
    spawnQueue.length = 0;
    spawnDripTimer = 0;
    enemiesById.clear();
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    clearRagdolls();
    bloodDrops.splice(0).forEach((drop) => releaseBloodDrop(drop.mesh));
    spawnWave();
    logConsole(`wave ${wave} spawned`, "ok");
    return;
  }
  if (command === "spawn") {
    const type = ENEMY_TYPES.includes(args[0]) ? args[0] : "raider";
    const count = Math.max(1, Math.min(20, Number(args[1]) || 1));
    for (let i = 0; i < count; i += 1) queueEnemySpawn(type, i);
    logConsole(`queued ${count} ${type}`, "ok");
    return;
  }
  if (command === "nocd") {
    state.noCooldown = !state.noCooldown;
    logConsole(`no cooldown ${state.noCooldown ? "on" : "off"}`, "ok");
    return;
  }
  if (command === "infammo") {
    state.infiniteAmmo = !state.infiniteAmmo;
    logConsole(`infinite ammo ${state.infiniteAmmo ? "on" : "off"}`, "ok");
    return;
  }
  if (command === "megajump") {
    state.megaJump = !state.megaJump;
    logConsole(`mega jump ${state.megaJump ? "on" : "off"}`, "ok");
    return;
  }
  if (command === "drop") {
    const pos = controls.getObject().position.clone();
    pos.x += Math.sin(controls.getObject().rotation.y) * 3;
    pos.z += Math.cos(controls.getObject().rotation.y) * 3;
    dropWeapon(pos, Math.floor(Math.random() * WEAPONS.length));
    logConsole("weapon dropped nearby", "ok");
    return;
  }
  logConsole("unknown command. type help", "warn");
}

function jump() {
  if (!state.started || !state.alive || !state.grounded) return;
  state.verticalVelocity = state.megaJump ? 15 : 8.6;
  state.grounded = false;
  state.shake = Math.max(state.shake, 0.025);
}

function selectWeapon(index, force = false) {
  if (index < 0 || index >= WEAPONS.length) return;
  if (!force && !state.ownedWeapons[index]) return;
  state.weaponIndex = index;
  weaponModels.forEach((model, modelIndex) => {
    model.visible = modelIndex === state.weaponIndex;
  });
  state.cameraKick = Math.max(state.cameraKick, 0.018);
}

function restart() {
  state.alive = true;
  state.health = 100;
  state.armor = 75;
  state.ammo = AMMO_MAX;
  state.ownedWeapons = WEAPONS.map(() => true);
  state.weaponIndex = 0;
  state.kills = 0;
  state.wave = 1;
  state.fireCooldown = 0;
  state.shieldCooldown = 0;
  state.verticalVelocity = 0;
  state.jumpOffset = 0;
  state.grounded = true;
  state.boostX = 0;
  state.boostZ = 0;
  state.spawnTimer = 0;
  keys.clear();
  nextEnemyId = 1;
  spawnQueue.length = 0;
  spawnDripTimer = 0;
  controls.getObject().position.set(0, PLAYER_HEIGHT, 18);
  enemiesById.clear();
  enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
  clearRagdolls();
  bloodDrops.splice(0).forEach((drop) => releaseBloodDrop(drop.mesh));
  projectiles.splice(0).forEach((shot) => scene.remove(shot.mesh));
  enemyBolts.splice(0).forEach((shot) => scene.remove(shot.mesh));
  pickups.splice(0).forEach((pickup) => scene.remove(pickup.mesh));
  if (isEnemyHost()) spawnWave();
  startButton.textContent = "Return to Battle";
  overlay.classList.add("hidden");
  if (!isTouchDevice()) controls.lock();
}

function spawnWave() {
  if (!isEnemyHost()) return;
  const waveCount = Math.min(6 + state.wave * 2, MAX_ENEMIES);
  for (let i = 0; i < waveCount; i += 1) {
    queueEnemySpawn(pickEnemyType(), i);
  }
}

function queueEnemySpawn(type, index = 0) {
  if (!isEnemyHost()) return;
  spawnQueue.push({ type, index });
}

function processSpawnQueue(delta) {
  if (!spawnQueue.length) return;
  spawnDripTimer -= delta;
  if (spawnDripTimer > 0) return;
  const next = spawnQueue.shift();
  spawnEnemy(next.type, next.index);
  spawnDripTimer = SPAWN_DRIP_DELAY;
}

function pickEnemyType() {
  const roll = gameRandom();
  if (state.wave <= 1) return roll > 0.78 ? "imp" : "raider";
  if (state.wave === 2) {
    if (roll < 0.18) return "wraith";
    if (roll > 0.78) return "stalker";
    return roll > 0.55 ? "imp" : "raider";
  }
  if (roll < 0.14) return "crawler";
  if (roll < 0.28) return "wraith";
  if (roll < 0.43) return "imp";
  if (roll < 0.58) return "stalker";
  if (roll < 0.76) return "sentinel";
  if (roll < 0.9) return "brute";
  return "raider";
}

function spawnEnemy(type, index = 0) {
  const angle = gameRandom() * Math.PI * 2 + index * 0.35;
  const radius = 26 + gameRandom() * 11;
  const enemy = createEnemy(type);
  enemy.netId = `${network.id ?? "local"}-${nextEnemyId++}`;
  enemy.group.position.set(Math.sin(angle) * radius, -1.35, Math.cos(angle) * radius);
  enemy.lastPosition.copy(enemy.group.position);
  enemy.group.scale.setScalar(0.62);
  enemy.group.rotation.y = angle + Math.PI;
  scene.add(enemy.group);
  enemiesById.set(enemy.netId, enemy);
  enemies.push(enemy);
}

function getEnemyStats(type) {
  const stats = {
    raider: {
      scale: 0.76,
      width: 1,
      bodyMat: materials.bone,
      trimMat: materials.gold,
      health: 74,
      healthPerWave: 8,
      speed: 3.0,
      damage: 12,
      attackRange: 1.75,
      ranged: false,
      weaponLength: 1.5,
      glow: 0xff3218
    },
    brute: {
      scale: 0.95,
      width: 1.18,
      bodyMat: materials.flesh,
      trimMat: materials.gold,
      health: 150,
      healthPerWave: 15,
      speed: 2.0,
      damage: 20,
      attackRange: 1.9,
      ranged: false,
      weaponLength: 1.9,
      glow: 0xff3218
    },
    wraith: {
      scale: 0.72,
      width: 0.9,
      bodyMat: materials.wraith,
      trimMat: materials.metal,
      health: 58,
      healthPerWave: 7,
      speed: 3.5,
      damage: 9,
      attackRange: 9.5,
      ranged: true,
      weaponLength: 1.25,
      glow: 0x53ffe0
    },
    imp: {
      scale: 0.66,
      width: 0.82,
      bodyMat: materials.flesh,
      trimMat: materials.rune,
      health: 48,
      healthPerWave: 6,
      speed: 3.85,
      damage: 8,
      attackRange: 8.5,
      ranged: true,
      weaponLength: 1.1,
      glow: 0xff6a1f
    },
    stalker: {
      scale: 0.7,
      width: 0.72,
      bodyMat: materials.bone,
      trimMat: materials.void,
      health: 64,
      healthPerWave: 8,
      speed: 4.45,
      damage: 14,
      attackRange: 1.55,
      ranged: false,
      weaponLength: 1.75,
      glow: 0xb48cff
    },
    sentinel: {
      scale: 0.84,
      width: 1.05,
      bodyMat: materials.metal,
      trimMat: materials.rune,
      health: 110,
      healthPerWave: 11,
      speed: 2.45,
      damage: 15,
      attackRange: 10.8,
      ranged: true,
      weaponLength: 1.7,
      glow: 0x5fffe0
    },
    crawler: {
      scale: 0.54,
      width: 1.35,
      bodyMat: materials.wraith,
      trimMat: materials.void,
      health: 42,
      healthPerWave: 6,
      speed: 4.8,
      damage: 7,
      attackRange: 1.35,
      ranged: false,
      weaponLength: 0.9,
      glow: 0x84ff5c
    }
  };
  return stats[type] ?? stats.raider;
}

function createEnemy(type) {
  const group = new THREE.Group();
  const stats = getEnemyStats(type);
  const scale = stats.scale;
  const bodyMat = stats.bodyMat;
  const trimMat = stats.trimMat;
  const limbs = { arms: [], legs: [], feet: [], wings: [] };

  const body = new THREE.Mesh(geometries.enemyBody, bodyMat);
  body.position.y = 1.58 * scale;
  body.scale.set(scale * 0.82, scale * 0.92, scale * 0.76);
  body.castShadow = true;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.16 * scale * stats.width, 0.44 * scale, 0.96 * scale), trimMat);
  chest.position.set(0, 2.02 * scale, 0.02);
  chest.castShadow = true;
  group.add(chest);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.92 * scale, 0.26 * scale, 0.7 * scale), materials.metal);
  waist.position.set(0, 0.88 * scale, 0);
  waist.castShadow = true;
  group.add(waist);

  const head = new THREE.Mesh(geometries.enemyHead, bodyMat);
  head.position.y = 2.7 * scale;
  head.scale.set(scale * 0.9, scale * 0.9, scale * 0.9);
  head.castShadow = true;
  group.add(head);

  for (let s = -1; s <= 1; s += 2) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.08 * scale, 0.04 * scale), materials.rune);
    eye.position.set(s * 0.18 * scale, 2.78 * scale, 0.4 * scale);
    group.add(eye);
  }

  for (let s = -1; s <= 1; s += 2) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14 * scale, 0.72 * scale, 5), trimMat);
    horn.position.set(s * 0.34 * scale, 3.2 * scale, 0.03);
    horn.rotation.z = s * 0.34;
    horn.castShadow = true;
    group.add(horn);

    const arm = new THREE.Mesh(geometries.enemyArm, type === "sentinel" ? materials.metal : bodyMat);
    arm.position.set(s * 0.78 * scale, 1.48 * scale, 0.08 * scale);
    arm.rotation.z = s * 0.36;
    arm.scale.set(scale * 0.82, scale * 0.9, scale * 0.82);
    arm.castShadow = true;
    group.add(arm);
    limbs.arms.push({ mesh: arm, side: s, baseY: arm.position.y, baseZ: arm.position.z, baseRotZ: arm.rotation.z });

    const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 * scale, 0), trimMat);
    shoulder.position.set(s * 0.76 * scale, 2.1 * scale, 0.02);
    shoulder.scale.set(1.25, 0.78, 0.95);
    shoulder.castShadow = true;
    group.add(shoulder);

    const leg = new THREE.Mesh(geometries.enemyLeg, bodyMat);
    leg.position.set(s * 0.26 * scale, 0.58 * scale, 0);
    leg.scale.set(scale * 0.72, scale * 0.9, scale * 0.72);
    leg.castShadow = true;
    group.add(leg);
    limbs.legs.push({ mesh: leg, side: s, baseY: leg.position.y, baseZ: leg.position.z, baseRotZ: leg.rotation.z });

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.18 * scale, 0.68 * scale), type === "crawler" ? materials.rune : trimMat);
    foot.position.set(s * 0.28 * scale, 0.12 * scale, 0.18 * scale);
    foot.castShadow = true;
    group.add(foot);
    limbs.feet.push({ mesh: foot, side: s, baseY: foot.position.y, baseZ: foot.position.z });
  }

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.14 * scale, stats.weaponLength * scale), trimMat);
  blade.position.set(0.96 * scale, 1.2 * scale, -0.65 * scale);
  blade.rotation.x = -0.75;
  blade.castShadow = true;
  group.add(blade);

  const spineCount = type === "brute" ? 6 : type === "stalker" ? 8 : 3;
  for (let i = 0; i < spineCount; i += 1) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.1 * scale, 0.58 * scale, 5), trimMat);
    spine.position.set((i - (spineCount - 1) / 2) * 0.22 * scale, (2.22 - Math.abs(i - spineCount / 2) * 0.03) * scale, -0.44 * scale);
    spine.rotation.x = -0.55;
    spine.castShadow = true;
    group.add(spine);
  }

  if (type === "wraith" || type === "sentinel") {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46 * scale, 0.035 * scale, 6, 18), materials.rune);
    halo.position.set(0, 2.28 * scale, -0.48 * scale);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  }

  if (type === "imp" || type === "stalker") {
    for (let s = -1; s <= 1; s += 2) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 1.1 * scale, 3), trimMat);
      wing.position.set(s * 0.72 * scale, 1.74 * scale, -0.42 * scale);
      wing.rotation.z = s * 0.85;
      wing.rotation.x = -0.65;
      wing.castShadow = true;
      group.add(wing);
      limbs.wings.push({ mesh: wing, side: s, baseRotZ: wing.rotation.z, baseRotX: wing.rotation.x });
    }
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.35 * scale, 24), materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  const glow = new THREE.PointLight(stats.glow, stats.ranged ? 0.58 : 0.38, 6, 2);
  glow.position.y = 2.2 * scale;
  group.add(glow);

  return {
    type,
    group,
    body,
    chest,
    head,
    blade,
    limbs,
    bodyBaseY: body.position.y,
    headBaseY: head.position.y,
    health: stats.health + state.wave * stats.healthPerWave,
    speed: stats.speed,
    damage: stats.damage,
    attackRange: stats.attackRange,
    ranged: stats.ranged,
    boltColor: stats.glow,
    spawnProgress: 0,
    attackTimer: 0.9 + gameRandom() * 1.1,
    bob: gameRandom() * Math.PI * 2,
    lastPosition: group.position.clone(),
    moveSpeed: 0,
    dead: false
  };
}

function fire() {
  const weapon = WEAPONS[state.weaponIndex];
  if (!state.started || !state.alive || state.fireCooldown > 0 || state.ammo < weapon.cost) return;
  if (!state.infiniteAmmo) state.ammo -= weapon.cost;
  state.fireCooldown = state.noCooldown ? 0.02 : weapon.cooldown;
  state.cameraKick = weapon.cooldown > 0.7 ? 0.075 : 0.044;
  state.shake = Math.max(state.shake, weapon.blastRadius ? 0.06 : 0.035);
  muzzleLight.intensity = 4.5;

  camera.getWorldDirection(forward);
  camera.getWorldPosition(aimPoint);
  if (network.roomId) {
    sendNetworkMessage({
      type: "fire",
      weaponIndex: state.weaponIndex,
      x: aimPoint.x,
      y: aimPoint.y,
      z: aimPoint.z,
      dx: forward.x,
      dy: forward.y,
      dz: forward.z
    });
  }
  for (let i = 0; i < weapon.shots; i += 1) {
    const shotDir = forward.clone();
    const spread = weapon.spread ?? 0;
    shotDir.x += (Math.random() - 0.5) * spread;
    shotDir.y += (Math.random() - 0.5) * spread * 0.7;
    shotDir.z += (Math.random() - 0.5) * spread;
    shotDir.normalize();

    const material =
      weapon.color === 0xff4a18 ? materials.lava : weapon.color === 0xb48cff ? materials.void : materials.rune;
    const projectile = weapon.disc
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 6), material)
      : new THREE.Mesh(geometries.projectile, material);
    projectile.position.copy(aimPoint).addScaledVector(shotDir, 1.2);
    projectile.scale.setScalar(weapon.size);
    if (weapon.disc) projectile.rotation.x = Math.PI / 2;
    scene.add(projectile);
    projectiles.push({
      mesh: projectile,
      velocity: shotDir.multiplyScalar(weapon.speed),
      ttl: weapon.ttl,
      damage: weapon.damage,
      pierce: weapon.pierce ?? 0,
      blastRadius: weapon.blastRadius ?? 0,
      gravity: weapon.gravity ?? 0,
      color: weapon.color,
      shield: weapon.disc
    });
  }

  spawnMuzzleSparks(aimPoint.clone().addScaledVector(forward, 1.25), forward, weapon.shots > 1 ? 24 : 12, weapon.color);
}

function throwShield() {
  if (!state.started || !state.alive || state.shieldCooldown > 0) return;
  state.shieldCooldown = 4.2;
  state.shieldCharge = 0;
  state.cameraKick = 0.03;

  camera.getWorldDirection(forward);
  camera.getWorldPosition(aimPoint);
  const mesh = new THREE.Group();
  const disc = new THREE.Mesh(geometries.shield, materials.rune);
  disc.rotation.x = Math.PI / 2;
  mesh.add(disc);
  for (let i = 0; i < 6; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.92), materials.gold);
    blade.position.set(Math.sin((i / 6) * Math.PI * 2) * 0.46, 0, Math.cos((i / 6) * Math.PI * 2) * 0.46);
    blade.rotation.y = (i / 6) * Math.PI * 2;
    mesh.add(blade);
  }
  mesh.position.copy(aimPoint).addScaledVector(forward, 1.4);
  scene.add(mesh);
  projectiles.push({
    mesh,
    velocity: forward.clone().multiplyScalar(39),
    ttl: 1.05,
    damage: 70,
    pierce: 3,
    shield: true
  });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.045);
  update(delta);
  renderer.render(scene, camera);
}

function update(delta) {
  updateTimers(delta);
  updateInput();
  if (state.started && state.alive) {
    updatePlayer(delta);
    if (state.touchFireHeld) fire();
  }
  updateEnemies(delta);
  updateProjectiles(delta);
  updatePickups(delta);
  updateEffects(delta);
  updateWeapon(delta);
  updateNetwork(delta);
  updateHud();
}

function updateTimers(delta) {
  state.fireCooldown = Math.max(0, state.fireCooldown - delta);
  state.shieldCooldown = Math.max(0, state.shieldCooldown - delta);
  state.shieldCharge = 1 - state.shieldCooldown / 4.2;
  state.invulnerable = Math.max(0, state.invulnerable - delta);
  state.spawnTimer = Math.max(0, state.spawnTimer - delta);
  muzzleLight.intensity = THREE.MathUtils.damp(muzzleLight.intensity, 0, 18, delta);
  if (!state.started && !network.roomId) {
    state.nextWaveAt = 0;
    return;
  }
  if (!isEnemyHost()) return;
  processSpawnQueue(delta);

  if (enemies.length === 0 && spawnQueue.length === 0 && state.alive) {
    state.nextWaveAt += delta;
    if (state.nextWaveAt > 2.2) {
      state.wave += 1;
      state.nextWaveAt = 0;
      state.ammo = Math.min(AMMO_MAX, state.ammo + 45);
      spawnWave();
    }
  } else {
    state.nextWaveAt = 0;
  }

  if (state.spawnTimer <= 0 && spawnQueue.length === 0 && enemies.length < Math.min(4 + state.wave, MAX_ENEMIES) && state.wave > 2) {
    state.spawnTimer = 4.6 - Math.min(state.wave * 0.15, 1.6);
    queueEnemySpawn(pickEnemyType());
  }
}

function updateInput() {
  input.x = 0;
  input.z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) input.z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) input.z += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) input.x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) input.x += 1;
  input.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");

  input.x += input.stickX;
  input.z += input.stickY;
  const length = Math.hypot(input.x, input.z);
  if (length > 1) {
    input.x /= length;
    input.z /= length;
  }
}

function updatePlayer(delta) {
  const object = controls.getObject();
  state.verticalVelocity -= 22 * delta;
  state.jumpOffset += state.verticalVelocity * delta;
  if (state.jumpOffset <= 0) {
    if (!state.grounded && state.verticalVelocity < -4) {
      state.shake = Math.max(state.shake, 0.05);
    }
    state.jumpOffset = 0;
    state.verticalVelocity = 0;
    state.grounded = true;
  }

  camera.getWorldDirection(flatForward);
  flatForward.y = 0;
  flatForward.normalize();
  right.crossVectors(flatForward, worldUp).normalize();

  const speed = input.sprint ? 10.2 : 7.2;
  tmpVec.set(0, 0, 0)
    .addScaledVector(flatForward, -input.z)
    .addScaledVector(right, input.x)
    .multiplyScalar(speed * delta);
  tmpVec.x += state.boostX * delta;
  tmpVec.z += state.boostZ * delta;
  object.position.add(tmpVec);
  state.boostX = THREE.MathUtils.damp(state.boostX, 0, 2.8, delta);
  state.boostZ = THREE.MathUtils.damp(state.boostZ, 0, 2.8, delta);

  for (const pad of jumpPads) {
    pad.cooldown = Math.max(0, pad.cooldown - delta);
    const padDist = Math.hypot(object.position.x - pad.x, object.position.z - pad.z);
    if (padDist < pad.radius && state.grounded && pad.cooldown <= 0) {
      const boostDir = new THREE.Vector3(Math.sin(pad.yaw), 0, Math.cos(pad.yaw));
      object.position.addScaledVector(boostDir, 1.15);
      state.boostX = boostDir.x * 17;
      state.boostZ = boostDir.z * 17;
      state.verticalVelocity = 13.8;
      state.jumpOffset = 0.18;
      state.grounded = false;
      state.shake = Math.max(state.shake, 0.085);
      pad.cooldown = 0.85;
      spawnMuzzleSparks(new THREE.Vector3(pad.x, 0.7, pad.z), worldUp, 30, 0x35f6d0);
    }
  }

  const dist = Math.hypot(object.position.x, object.position.z);
  if (dist > ARENA_RADIUS - PLAYER_RADIUS) {
    object.position.x = (object.position.x / dist) * (ARENA_RADIUS - PLAYER_RADIUS);
    object.position.z = (object.position.z / dist) * (ARENA_RADIUS - PLAYER_RADIUS);
  }
  object.position.y = PLAYER_HEIGHT + state.jumpOffset;

  const hazardDist = Math.hypot(object.position.x, object.position.z);
  if (hazardDist > ARENA_RADIUS - 2.2 && state.invulnerable <= 0) {
    damagePlayer(8);
  }
}

function getClosestPlayerPosition(enemyPosition, localPlayerPosition) {
  targetTmp.copy(localPlayerPosition);
  let bestDistance = Math.hypot(enemyPosition.x - targetTmp.x, enemyPosition.z - targetTmp.z);
  for (const peer of network.peers.values()) {
    const distance = Math.hypot(enemyPosition.x - peer.group.position.x, enemyPosition.z - peer.group.position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      targetTmp.set(peer.group.position.x, PLAYER_HEIGHT + peer.group.position.y, peer.group.position.z);
    }
  }
  return targetTmp;
}

function animateEnemyWalk(enemy, delta, moveSpeed, attacking) {
  const speedAmount = THREE.MathUtils.clamp(moveSpeed / Math.max(enemy.speed, 0.001), 0, 1);
  const attackAmount = attacking && enemy.ranged ? 0.35 : attacking ? 0.18 : 0;
  const amount = Math.max(speedAmount, attackAmount);
  const typePace = enemy.type === "crawler" ? 1.45 : enemy.type === "brute" ? 0.78 : 1;
  enemy.bob += delta * (3.8 + moveSpeed * 1.1) * typePace * (0.18 + amount);

  const phase = enemy.bob;
  const bounce = Math.abs(Math.sin(phase)) * amount;
  const sway = Math.sin(phase * 0.5) * amount;
  enemy.body.position.y = THREE.MathUtils.damp(enemy.body.position.y, enemy.bodyBaseY + bounce * 0.08, 15, delta);
  enemy.body.rotation.x = THREE.MathUtils.damp(enemy.body.rotation.x, Math.sin(phase * 0.8) * amount * 0.055, 14, delta);
  enemy.body.rotation.z = THREE.MathUtils.damp(enemy.body.rotation.z, sway * 0.08, 14, delta);
  enemy.head.position.y = THREE.MathUtils.damp(enemy.head.position.y, enemy.headBaseY + bounce * 0.055, 15, delta);

  for (const leg of enemy.limbs.legs) {
    const sidePhase = phase + (leg.side > 0 ? 0 : Math.PI);
    const cycle = Math.sin(sidePhase);
    const lift = Math.max(0, -Math.cos(sidePhase)) * amount;
    leg.mesh.rotation.x = THREE.MathUtils.damp(leg.mesh.rotation.x, cycle * amount * 0.72, 18, delta);
    leg.mesh.rotation.z = THREE.MathUtils.damp(leg.mesh.rotation.z, leg.baseRotZ - leg.side * amount * 0.08, 16, delta);
    leg.mesh.position.y = THREE.MathUtils.damp(leg.mesh.position.y, leg.baseY + lift * 0.14, 18, delta);
    leg.mesh.position.z = THREE.MathUtils.damp(leg.mesh.position.z, leg.baseZ - cycle * amount * 0.12, 18, delta);
  }

  for (const foot of enemy.limbs.feet) {
    const sidePhase = phase + (foot.side > 0 ? 0 : Math.PI);
    const cycle = Math.sin(sidePhase);
    const lift = Math.max(0, -Math.cos(sidePhase)) * amount;
    foot.mesh.rotation.x = THREE.MathUtils.damp(foot.mesh.rotation.x, -cycle * amount * 0.45, 18, delta);
    foot.mesh.position.y = THREE.MathUtils.damp(foot.mesh.position.y, foot.baseY + lift * 0.1, 18, delta);
    foot.mesh.position.z = THREE.MathUtils.damp(foot.mesh.position.z, foot.baseZ - cycle * amount * 0.18, 18, delta);
  }

  for (const arm of enemy.limbs.arms) {
    const cycle = Math.sin(phase + (arm.side > 0 ? Math.PI : 0));
    const attackReach = attacking ? -0.28 : 0;
    arm.mesh.rotation.x = THREE.MathUtils.damp(arm.mesh.rotation.x, cycle * amount * 0.62 + attackReach, 16, delta);
    arm.mesh.rotation.z = THREE.MathUtils.damp(arm.mesh.rotation.z, arm.baseRotZ + arm.side * amount * 0.12, 16, delta);
    arm.mesh.position.y = THREE.MathUtils.damp(arm.mesh.position.y, arm.baseY + bounce * 0.045, 16, delta);
    arm.mesh.position.z = THREE.MathUtils.damp(arm.mesh.position.z, arm.baseZ - Math.abs(cycle) * amount * 0.08, 16, delta);
  }

  for (const wing of enemy.limbs.wings) {
    wing.mesh.rotation.z = THREE.MathUtils.damp(wing.mesh.rotation.z, wing.baseRotZ + Math.sin(phase * 1.4) * amount * 0.16, 10, delta);
    wing.mesh.rotation.x = THREE.MathUtils.damp(wing.mesh.rotation.x, wing.baseRotX - Math.abs(Math.sin(phase)) * amount * 0.1, 10, delta);
  }

  if (enemy.blade) {
    enemy.blade.rotation.z = THREE.MathUtils.damp(enemy.blade.rotation.z, Math.sin(phase + 0.6) * amount * 0.18, 12, delta);
  }
}

function updateEnemies(delta) {
  const canControlEnemies = isEnemyHost();
  const playerPos = controls.getObject().position;
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    const pos = enemy.group.position;
    if (!canControlEnemies) {
      const visualSpeed = enemy.lastPosition.distanceTo(pos) / Math.max(delta, 0.001);
      animateEnemyWalk(enemy, delta, visualSpeed, false);
      enemy.lastPosition.copy(pos);
      continue;
    }

    const toPlayer = tmpVec.copy(getClosestPlayerPosition(pos, playerPos)).sub(pos);
    const distance = Math.max(0.001, Math.hypot(toPlayer.x, toPlayer.z));
    const dirX = toPlayer.x / distance;
    const dirZ = toPlayer.z / distance;

    enemy.group.rotation.y = Math.atan2(dirX, dirZ);
    if (enemy.spawnProgress < 1) {
      enemy.spawnProgress = Math.min(1, enemy.spawnProgress + delta / ENEMY_EMERGE_TIME);
      const emerge = 1 - Math.pow(1 - enemy.spawnProgress, 3);
      enemy.group.position.y = THREE.MathUtils.lerp(-1.35, 0.08, emerge);
      enemy.group.scale.setScalar(THREE.MathUtils.lerp(0.62, 1, emerge));
      animateEnemyWalk(enemy, delta, 0.25, false);
      enemy.lastPosition.copy(pos);
      continue;
    }

    enemy.group.position.y = 0.08;
    enemy.group.scale.setScalar(1);
    let moveSpeed = 0;

    if (distance > enemy.attackRange) {
      const stride = enemy.speed * delta * (state.alive ? 1 : 0.25);
      pos.x += dirX * stride;
      pos.z += dirZ * stride;
      moveSpeed = stride / Math.max(delta, 0.001);
    }

    enemy.attackTimer -= delta;
    if (distance <= enemy.attackRange && enemy.attackTimer <= 0 && state.alive) {
      if (enemy.ranged) {
        shootEnemyBolt(enemy, dirX, dirZ);
        enemy.attackTimer = enemy.type === "sentinel" ? 1.55 : 1.05 + Math.random() * 0.45;
      } else {
        damagePlayer(enemy.damage);
        enemy.attackTimer = enemy.type === "brute" ? 1.0 : enemy.type === "crawler" ? 0.46 : 0.72;
      }
    }

    if (distance < PLAYER_RADIUS + ENEMY_HIT_RADIUS && state.invulnerable <= 0) {
      damagePlayer(Math.ceil(enemy.damage * 0.5));
    }
    animateEnemyWalk(enemy, delta, moveSpeed, distance <= enemy.attackRange);
    enemy.lastPosition.copy(pos);
  }
}

function updateProjectiles(delta) {
  const canDamageEnemies = isEnemyHost();
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const shot = projectiles[i];
    shot.ttl -= delta;
    if (shot.gravity) shot.velocity.y -= shot.gravity * delta;
    shot.mesh.position.addScaledVector(shot.velocity, delta);
    shot.mesh.rotation.x += delta * 18;
    shot.mesh.rotation.y += delta * 24;

    let hit = false;
    if (canDamageEnemies) for (let e = enemies.length - 1; e >= 0; e -= 1) {
      const enemy = enemies[e];
      const radius = enemy.type === "brute" ? 1.7 : 1.1;
      const dy = Math.abs(shot.mesh.position.y - (enemy.group.position.y + 1.55));
      const dist = shot.mesh.position.distanceTo(enemy.group.position);
      if (dist < radius + 0.65 && dy < 2.6) {
        enemy.health -= shot.damage;
        spawnMuzzleSparks(shot.mesh.position, shot.velocity.clone().normalize(), shot.shield ? 26 : 14, shot.shield ? 0xf3d193 : 0x5fffe0);
        spawnBloodHit(shot.mesh.position, shot.velocity.clone().normalize(), enemy.type, shot.damage);
        flashHit();
        if (enemy.health <= 0) {
          killEnemy(enemy, e);
        }
        if (shot.blastRadius) {
          explodeProjectile(shot);
        }
        if (shot.pierce > 0) {
          shot.pierce -= 1;
        } else {
          hit = true;
          break;
        }
      }
    }

    const arenaDist = Math.hypot(shot.mesh.position.x, shot.mesh.position.z);
    if (shot.ttl <= 0 && shot.blastRadius) explodeProjectile(shot);
    if (shot.ttl <= 0 || hit || arenaDist > ARENA_RADIUS + 4 || shot.mesh.position.y < 0.12) {
      if (shot.mesh.position.y < 0.12 && shot.blastRadius) explodeProjectile(shot);
      scene.remove(shot.mesh);
      projectiles.splice(i, 1);
    }
  }

  for (let i = enemyBolts.length - 1; i >= 0; i -= 1) {
    const shot = enemyBolts[i];
    shot.ttl -= delta;
    shot.mesh.position.addScaledVector(shot.velocity, delta);
    shot.mesh.rotation.y += delta * 10;
    const playerWorld = controls.getObject().position.clone().add(new THREE.Vector3(0, -0.35, 0));
    if (shot.mesh.position.distanceTo(playerWorld) < 1.2) {
      damagePlayer(shot.damage);
      scene.remove(shot.mesh);
      enemyBolts.splice(i, 1);
      continue;
    }
    if (shot.ttl <= 0 || Math.hypot(shot.mesh.position.x, shot.mesh.position.z) > ARENA_RADIUS) {
      scene.remove(shot.mesh);
      enemyBolts.splice(i, 1);
    }
  }
}

function updatePickups(delta) {
  const playerPos = controls.getObject().position;
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    pickup.mesh.rotation.y += delta * 2.4;
    pickup.mesh.position.y = 0.8 + Math.sin(clock.elapsedTime * 3 + pickup.phase) * 0.12;
    if (pickup.mesh.position.distanceTo(playerPos) < 2) {
      if (pickup.kind === "health") state.health = Math.min(100, state.health + 24);
      if (pickup.kind === "armor") state.armor = Math.min(100, state.armor + 22);
      if (pickup.kind === "ammo") state.ammo = Math.min(AMMO_MAX, state.ammo + 32);
      if (pickup.kind === "weapon") {
        state.ownedWeapons[pickup.weaponIndex] = true;
        state.weaponIndex = pickup.weaponIndex;
        state.ammo = Math.min(AMMO_MAX, state.ammo + 90);
      }
      const sparkColor =
        pickup.kind === "health"
          ? 0xff3418
          : pickup.kind === "armor"
            ? 0xd59f4b
            : pickup.kind === "weapon"
              ? WEAPONS[pickup.weaponIndex].color
              : 0x57ffd7;
      spawnMuzzleSparks(pickup.mesh.position, worldUp, 20, sparkColor);
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
    }
  }
}

function updateEffects(delta) {
  const emberCloud = scene.getObjectByName("emberCloud");
  const positions = emberCloud.geometry.attributes.position.array;
  for (let i = 0; i < embers.length; i += 1) {
    positions[i * 3 + 1] += embers[i].speed * delta;
    positions[i * 3] += Math.sin(clock.elapsedTime + embers[i].phase) * delta * 0.12;
    if (positions[i * 3 + 1] > 23) positions[i * 3 + 1] = 3.0;
  }
  emberCloud.geometry.attributes.position.needsUpdate = true;

  for (const hazard of hazards) {
    hazard.light.intensity = 2.45 + Math.sin(clock.elapsedTime * 6 + hazard.pulse) * 0.38;
  }

  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.life -= delta;
    spark.mesh.position.addScaledVector(spark.velocity, delta);
    spark.velocity.y -= 8 * delta;
    spark.mesh.scale.setScalar(spark.size * Math.max(0, spark.life / spark.maxLife));
    if (spark.life <= 0) {
      releaseSpark(spark.mesh);
      sparks.splice(i, 1);
    }
  }

  for (let i = bloodDrops.length - 1; i >= 0; i -= 1) {
    const drop = bloodDrops[i];
    drop.life -= delta;
    drop.mesh.position.addScaledVector(drop.velocity, delta);
    drop.velocity.y -= 15 * delta;
    drop.mesh.rotation.x += drop.spin.x * delta;
    drop.mesh.rotation.y += drop.spin.y * delta;
    drop.mesh.rotation.z += drop.spin.z * delta;
    const fade = Math.max(0, drop.life / drop.maxLife);
    drop.mesh.scale.setScalar(drop.size * (0.65 + fade * 0.35));

    if (drop.mesh.position.y <= 0.08) {
      makeBloodSplat(drop.mesh.position, drop.color, drop.size * (2.2 + Math.random() * 1.7));
      releaseBloodDrop(drop.mesh);
      bloodDrops.splice(i, 1);
      continue;
    }

    if (drop.life <= 0) {
      releaseBloodDrop(drop.mesh);
      bloodDrops.splice(i, 1);
    }
  }

  for (let i = ragdolls.length - 1; i >= 0; i -= 1) {
    const part = ragdolls[i];
    part.ttl -= delta;
    part.velocity.y -= 18 * delta;
    part.mesh.position.addScaledVector(part.velocity, delta);
    part.mesh.rotation.x += part.spin.x * delta;
    part.mesh.rotation.y += part.spin.y * delta;
    part.mesh.rotation.z += part.spin.z * delta;

    const floorOffset = getRagdollFloorOffset(part);
    if (part.mesh.position.y + floorOffset < 0.055) {
      part.mesh.position.y = 0.055 - floorOffset;
      if (Math.abs(part.velocity.y) > 1.2) {
        part.velocity.y = Math.abs(part.velocity.y) * 0.22;
        part.spin.multiplyScalar(0.58);
      } else {
        part.velocity.y = 0;
        part.spin.multiplyScalar(0.52);
      }
      part.velocity.x *= 0.68;
      part.velocity.z *= 0.68;
    } else {
      part.velocity.x *= Math.exp(-0.45 * delta);
      part.velocity.z *= Math.exp(-0.45 * delta);
    }

    if (part.ttl <= 0) {
      scene.remove(part.mesh);
      ragdolls.splice(i, 1);
    }
  }

  for (let i = decals.length - 1; i >= 0; i -= 1) {
    decals[i].ttl -= delta;
    decals[i].mesh.material.opacity = Math.max(0, decals[i].ttl / 7) * 0.35;
    if (decals[i].ttl <= 0) {
      scene.remove(decals[i].mesh);
      decals[i].mesh.material.dispose();
      decals.splice(i, 1);
    }
  }
}

function updateWeapon(delta) {
  const walking = Math.hypot(input.x, input.z) > 0.15 && state.alive;
  const bob = walking ? Math.sin(clock.elapsedTime * 11) * 0.035 : 0;
  const recoil = state.cameraKick;
  const shake = state.shake;

  weaponRig.position.x = THREE.MathUtils.damp(
    weaponRig.position.x,
    WEAPON_BASE_POSITION.x + (Math.random() - 0.5) * shake * 0.18,
    18,
    delta
  );
  weaponRig.position.y = THREE.MathUtils.damp(
    weaponRig.position.y,
    WEAPON_BASE_POSITION.y + bob - recoil * 1.1 + (Math.random() - 0.5) * shake * 0.12,
    18,
    delta
  );
  weaponRig.position.z = THREE.MathUtils.damp(
    weaponRig.position.z,
    WEAPON_BASE_POSITION.z + recoil * 1.7,
    18,
    delta
  );
  weaponRig.rotation.x = THREE.MathUtils.damp(weaponRig.rotation.x, -recoil * 0.45, 18, delta);
  weaponRig.rotation.z = THREE.MathUtils.damp(
    weaponRig.rotation.z,
    -input.x * 0.04 + (Math.random() - 0.5) * shake * 0.06,
    10,
    delta
  );
  state.cameraKick = THREE.MathUtils.damp(state.cameraKick, 0, 22, delta);
  state.shake = Math.max(0, state.shake - delta * 0.75);

  shieldMesh.visible = state.shieldCooldown <= 3.35 || !state.alive;
  shieldMesh.rotation.z += delta * (state.shieldCooldown > 0 ? 1.1 : 0.3);
}

function updateHud() {
  healthText.textContent = Math.max(0, Math.ceil(state.health));
  armorText.textContent = Math.max(0, Math.ceil(state.armor));
  ammoText.textContent = state.ammo;
  weaponLabel.textContent = `${state.weaponIndex + 1} ${WEAPONS[state.weaponIndex].name}`.toUpperCase();
  killText.textContent = `${state.kills}`;
  waveText.textContent = `WAVE ${roman[state.wave - 1] ?? state.wave}`;
  healthBar.style.transform = `scaleX(${THREE.MathUtils.clamp(state.health / 100, 0, 1)})`;
  armorBar.style.transform = `scaleX(${THREE.MathUtils.clamp(state.armor / 100, 0, 1)})`;
  shieldCooldown.style.transform = `scaleX(${THREE.MathUtils.clamp(state.shieldCharge, 0, 1)})`;
}

function damagePlayer(amount) {
  if (state.godMode) return;
  if (!state.alive || state.invulnerable > 0) return;
  state.invulnerable = 0.34;
  state.shake = Math.max(state.shake, 0.16);
  const blocked = Math.min(state.armor, amount * 0.68);
  state.armor -= blocked;
  state.health -= amount - blocked * 0.55;
  damageVignette.style.opacity = "1";
  window.setTimeout(() => {
    damageVignette.style.opacity = "0";
  }, 120);

  if (state.health <= 0) {
    die();
  }
}

function clearRagdolls() {
  ragdolls.splice(0).forEach((part) => scene.remove(part.mesh));
}

function makeRagdollContactCorners(mesh) {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return [new THREE.Vector3(0, -0.2, 0)];
  const sx = Math.abs(mesh.scale.x);
  const sy = Math.abs(mesh.scale.y);
  const sz = Math.abs(mesh.scale.z);
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push(new THREE.Vector3(x * sx, y * sy, z * sz));
      }
    }
  }
  return corners;
}

function getRagdollFloorOffset(part) {
  let lowest = Infinity;
  for (const corner of part.contactCorners) {
    ragdollCornerTmp.copy(corner).applyQuaternion(part.mesh.quaternion);
    if (ragdollCornerTmp.y < lowest) lowest = ragdollCornerTmp.y;
  }
  return Number.isFinite(lowest) ? lowest : -0.2;
}

function die() {
  state.alive = false;
  state.health = 0;
  if (network.roomId && isEnemyHost()) {
    sendNetworkMessage({ type: "host-dead" });
  }
  overlay.classList.remove("hidden");
  startButton.textContent = "Rise Again";
  if (controls.isLocked) controls.unlock();
}

function killEnemy(enemy, index) {
  state.kills += 1;
  maybeDrop(enemy.group.position);
  makeScorch(enemy.group.position, enemy.type === "wraith" ? 0x20c8a4 : 0xff3218);
  spawnMuzzleSparks(enemy.group.position.clone().setY(1.6), worldUp, enemy.type === "brute" ? 44 : 28, enemy.type === "wraith" ? 0x5fffe0 : 0xff5a1d);
  spawnEnemyRagdoll(enemy);
  scene.remove(enemy.group);
  enemiesById.delete(String(enemy.netId));
  enemies.splice(index, 1);
}

function spawnEnemyRagdoll(enemy, force = 1) {
  enemy.group.updateMatrixWorld(true);
  const origin = enemy.group.position;
  const playerPos = controls.getObject().position;
  const away = new THREE.Vector3(origin.x - playerPos.x, 0, origin.z - playerPos.z);
  if (away.lengthSq() < 0.001) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  away.normalize();

  const parts = [];
  enemy.group.traverse((child) => {
    if (!child.isMesh || child.material === materials.shadow || child.geometry?.type === "CircleGeometry") return;
    parts.push(child);
  });

  for (const child of parts) {
    if (ragdolls.length >= MAX_RAGDOLL_PARTS) {
      const oldest = ragdolls.shift();
      if (oldest) scene.remove(oldest.mesh);
    }

    const mesh = new THREE.Mesh(child.geometry, child.material);
    child.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = child.castShadow;
    mesh.receiveShadow = child.receiveShadow;
    scene.add(mesh);

    const contactCorners = makeRagdollContactCorners(mesh);
    const sideKick = (Math.random() - 0.5) * 6.5 * force;
    const launch = 4.5 + Math.random() * 7.5;
    const velocity = new THREE.Vector3(
      away.x * (4.5 + Math.random() * 6) * force + sideKick,
      launch * force,
      away.z * (4.5 + Math.random() * 6) * force + (Math.random() - 0.5) * 6.5 * force
    );
    const spin = new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 12
    );
    ragdolls.push({
      mesh,
      velocity,
      spin,
      contactCorners,
      ttl: 4.2 + Math.random() * 1.8
    });
  }
}

function shootEnemyBolt(enemy, dirX, dirZ) {
  const mesh = new THREE.Mesh(geometries.enemyBolt, materials.lava);
  mesh.position.copy(enemy.group.position).add(new THREE.Vector3(0, 2.0, 0));
  scene.add(mesh);
  enemyBolts.push({
    mesh,
    velocity: new THREE.Vector3(dirX, 0.03, dirZ).normalize().multiplyScalar(14),
    ttl: 3.2,
    damage: enemy.damage
  });
}

function explodeProjectile(shot) {
  if (shot.exploded) return;
  shot.exploded = true;
  const origin = shot.mesh.position.clone();
  if (!isEnemyHost()) {
    makeScorch(origin, shot.color ?? 0xff4a18);
    spawnMuzzleSparks(origin, worldUp, 30, shot.color ?? 0xff4a18);
    state.shake = Math.max(state.shake, 0.08);
    return;
  }
  for (let e = enemies.length - 1; e >= 0; e -= 1) {
    const enemy = enemies[e];
    const distance = enemy.group.position.distanceTo(origin);
    if (distance <= shot.blastRadius) {
      const falloff = 1 - distance / shot.blastRadius;
      enemy.health -= shot.damage * (0.35 + falloff * 0.85);
      spawnBloodHit(enemy.group.position.clone().setY(1.45), enemy.group.position.clone().sub(origin).normalize(), enemy.type, shot.damage * falloff);
      if (enemy.health <= 0) killEnemy(enemy, e);
    }
  }
  makeScorch(origin, shot.color ?? 0xff4a18);
  spawnMuzzleSparks(origin, worldUp, 44, shot.color ?? 0xff4a18);
  state.shake = Math.max(state.shake, 0.12);
}

function maybeDrop(position) {
  if (Math.random() > 0.5) return;
  const kindRoll = Math.random();
  if (kindRoll > 0.82) {
    dropWeapon(position, Math.floor(Math.random() * WEAPONS.length));
    return;
  }
  const kind = kindRoll < 0.35 ? "health" : kindRoll < 0.65 ? "armor" : "ammo";
  const mat = kind === "health" ? materials.lava : kind === "armor" ? materials.gold : materials.rune;
  const mesh = new THREE.Mesh(geometries.pickup, mat);
  mesh.position.copy(position).setY(0.8);
  mesh.castShadow = true;
  scene.add(mesh);
  pickups.push({ mesh, kind, phase: Math.random() * Math.PI * 2 });
}

function dropWeapon(position, weaponIndex) {
  const group = new THREE.Group();
  const weapon = WEAPONS[weaponIndex];
  const mat =
    weapon.color === 0xff4a18 ? materials.lava : weapon.color === 0xb48cff ? materials.void : materials.rune;
  const core = new THREE.Mesh(geometries.weaponPickupCore, mat);
  const barrel = new THREE.Mesh(geometries.weaponPickupBarrel, materials.metal);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = 0.48;
  const ring = new THREE.Mesh(geometries.weaponPickupRing, mat);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = -0.34;
  group.add(core, barrel, ring);
  group.position.copy(position).setY(0.95);
  group.castShadow = true;
  scene.add(group);
  pickups.push({ mesh: group, kind: "weapon", weaponIndex, phase: Math.random() * Math.PI * 2 });
}

function makeScorch(position, color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometries.scorch, material);
  mesh.scale.setScalar(1.1 + Math.random() * 0.9);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position).setY(0.035);
  mesh.rotation.z = Math.random() * Math.PI;
  scene.add(mesh);
  decals.push({ mesh, ttl: 7 });
}

function enemyBloodColor(type) {
  if (type === "wraith" || type === "crawler") return 0x159e83;
  if (type === "sentinel") return 0xb34a1d;
  if (type === "imp" || type === "brute") return 0x9a0905;
  return 0x6f0704;
}

function makeBloodSplat(position, color, scale = 0.5) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometries.bloodSplat, material);
  mesh.scale.set(scale * (0.7 + Math.random() * 0.75), scale * (0.38 + Math.random() * 0.44), 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.random() * Math.PI;
  mesh.position.copy(position).setY(0.042 + Math.random() * 0.006);
  scene.add(mesh);
  decals.push({ mesh, ttl: 8.5 + Math.random() * 2.5 });
}

function sparkMaterial(color) {
  const key = new THREE.Color(color).getHex();
  if (!sparkMaterials.has(key)) {
    sparkMaterials.set(
      key,
      new THREE.MeshBasicMaterial({
        color: key,
        transparent: true,
        opacity: 0.95
      })
    );
  }
  return sparkMaterials.get(key);
}

function bloodMaterial(color) {
  const key = new THREE.Color(color).getHex();
  if (!bloodMaterials.has(key)) {
    bloodMaterials.set(
      key,
      new THREE.MeshBasicMaterial({
        color: key,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
  }
  return bloodMaterials.get(key);
}

function takeSpark(color) {
  const mesh = sparkPool.pop() ?? new THREE.Mesh(geometries.spark, sparkMaterial(color));
  mesh.material = sparkMaterial(color);
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function takeBloodDrop(color) {
  const mesh = bloodPool.pop() ?? new THREE.Mesh(geometries.bloodDrop, bloodMaterial(color));
  mesh.material = bloodMaterial(color);
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function releaseSpark(mesh) {
  scene.remove(mesh);
  mesh.visible = false;
  if (sparkPool.length < MAX_SPARK_POOL) sparkPool.push(mesh);
}

function releaseBloodDrop(mesh) {
  scene.remove(mesh);
  mesh.visible = false;
  if (bloodPool.length < MAX_BLOOD_POOL) bloodPool.push(mesh);
}

function spawnMuzzleSparks(origin, direction, count, color) {
  for (let i = 0; i < count; i += 1) {
    const size = 0.035 + Math.random() * 0.055;
    const mesh = takeSpark(color);
    mesh.scale.setScalar(size);
    mesh.position.copy(origin);
    const side = new THREE.Vector3(
      (Math.random() - 0.5) * 1.9,
      (Math.random() - 0.15) * 1.2,
      (Math.random() - 0.5) * 1.9
    );
    const velocity = direction.clone().multiplyScalar(2 + Math.random() * 7).add(side);
    sparks.push({ mesh, velocity, life: 0.25 + Math.random() * 0.42, maxLife: 0.68, size });
  }
}

function spawnBloodHit(origin, direction, type, damage = 25) {
  const color = enemyBloodColor(type);
  const baseDir = direction.clone();
  if (baseDir.lengthSq() < 0.001) baseDir.set(Math.random() - 0.5, 0.25, Math.random() - 0.5);
  baseDir.normalize();
  const count = Math.min(28, 8 + Math.ceil(damage / 6));
  makeBloodSplat(origin, color, 0.28 + Math.min(damage, 90) * 0.006);

  for (let i = 0; i < count; i += 1) {
    while (bloodDrops.length >= MAX_BLOOD_DROPS) {
      const oldest = bloodDrops.shift();
      if (oldest) releaseBloodDrop(oldest.mesh);
    }
    const size = 0.035 + Math.random() * 0.075;
    const mesh = takeBloodDrop(color);
    mesh.scale.setScalar(size);
    mesh.position.copy(origin).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.18,
      (Math.random() - 0.35) * 0.16,
      (Math.random() - 0.5) * 0.18
    ));
    const spray = new THREE.Vector3(
      (Math.random() - 0.5) * 4.2,
      1.4 + Math.random() * 5.8,
      (Math.random() - 0.5) * 4.2
    );
    const velocity = baseDir.clone().multiplyScalar(1.8 + Math.random() * 5.5).add(spray);
    bloodDrops.push({
      mesh,
      color,
      velocity,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 14
      ),
      life: 0.55 + Math.random() * 0.55,
      maxLife: 1.1,
      size
    });
  }
}

function flashHit() {
  hitFlash.style.opacity = "1";
  window.setTimeout(() => {
    hitFlash.style.opacity = "0";
  }, 55);
}

function updateStick(event) {
  const rect = stickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const distance = Math.min(48, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  input.stickX = Math.cos(angle) * (distance / 48);
  input.stickY = Math.sin(angle) * (distance / 48);
  stickKnob.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
}

function resetStick(event) {
  if (event?.pointerId && input.stickPointer !== event.pointerId) return;
  input.stickPointer = null;
  input.stickX = 0;
  input.stickY = 0;
  stickKnob.style.transform = "translate(0, 0)";
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function makeSkyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 2048;
  textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, "#08090f");
  gradient.addColorStop(0.34, "#130908");
  gradient.addColorStop(0.62, "#2b0d08");
  gradient.addColorStop(1, "#050303");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2048, 1024);

  for (let i = 0; i < 520; i += 1) {
    const x = Math.random() * 2048;
    const y = Math.random() * 690;
    const size = Math.random() > 0.92 ? 3 : 1 + Math.random() * 1.4;
    ctx.fillStyle = withAlpha(Math.random() > 0.7 ? "#ffd16c" : "#f0c492", 0.25 + Math.random() * 0.65);
    ctx.fillRect(x, y, size, size);
  }

  for (let i = 0; i < 9; i += 1) {
    const x = Math.random() * 2048;
    const y = 120 + Math.random() * 300;
    const radius = 180 + Math.random() * 260;
    const nebula = ctx.createRadialGradient(x, y, 0, x, y, radius);
    nebula.addColorStop(0, "rgba(145, 27, 18, 0.22)");
    nebula.addColorStop(0.45, "rgba(85, 16, 13, 0.11)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const moonX = 1500;
  const moonY = 250;
  const moon = ctx.createRadialGradient(moonX - 18, moonY - 18, 8, moonX, moonY, 86);
  moon.addColorStop(0, "rgba(255, 196, 111, 0.95)");
  moon.addColorStop(0.48, "rgba(198, 73, 36, 0.62)");
  moon.addColorStop(1, "rgba(198, 73, 36, 0)");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 86, 0, Math.PI * 2);
  ctx.fill();

  for (let layer = 0; layer < 3; layer += 1) {
    ctx.fillStyle = layer === 0 ? "#070403" : layer === 1 ? "#0d0605" : "#160806";
    ctx.beginPath();
    ctx.moveTo(0, 890 + layer * 34);
    for (let x = 0; x <= 2048; x += 62) {
      const peak = 760 + layer * 42 + Math.random() * 86;
      ctx.lineTo(x, peak);
      ctx.lineTo(x + 38 + Math.random() * 42, 890 + layer * 34);
    }
    ctx.lineTo(2048, 1024);
    ctx.lineTo(0, 1024);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function makeNoiseTexture(base, accent, size, grains, alpha, style = "noise") {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  if (style === "stone") {
    ctx.strokeStyle = withAlpha("#f2b36a", 0.12);
    ctx.lineWidth = 2;
    for (let y = 0; y <= size; y += size / 8) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 10);
      ctx.lineTo(size, y + Math.random() * 10);
      ctx.stroke();
    }
    for (let x = 0; x <= size; x += size / 6) {
      ctx.beginPath();
      ctx.moveTo(x + Math.random() * 12, 0);
      ctx.lineTo(x + Math.random() * 12, size);
      ctx.stroke();
    }
  }

  if (style === "metal") {
    for (let y = 0; y < size; y += 18) {
      ctx.fillStyle = withAlpha(y % 36 === 0 ? "#d78c36" : "#050505", 0.08);
      ctx.fillRect(0, y, size, 4);
    }
    for (let i = 0; i < 34; i += 1) {
      ctx.fillStyle = withAlpha("#f3c16f", 0.22);
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (style === "hide" || style === "runes") {
    for (let i = 0; i < 26; i += 1) {
      ctx.strokeStyle = withAlpha(style === "runes" ? "#70ffe0" : "#f0b079", style === "runes" ? 0.22 : 0.12);
      ctx.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + 18 + Math.random() * 70);
      ctx.stroke();
    }
  }

  for (let i = 0; i < grains; i += 1) {
    ctx.fillStyle = withAlpha(Math.random() > 0.5 ? accent : "#ffffff", Math.random() * alpha);
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 5, 1 + Math.random() * 5);
  }
  for (let i = 0; i < 32; i += 1) {
    ctx.strokeStyle = withAlpha(accent, 0.12 + Math.random() * 0.12);
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFloorTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 1024;
  textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#4c3026";
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = "rgba(242, 172, 89, 0.34)";
  ctx.lineWidth = 5;
  for (let i = -1024; i <= 2048; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 1024, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 64, 1024);
    ctx.lineTo(i + 1088, 0);
    ctx.stroke();
  }

  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 14 + Math.random() * 52;
    ctx.fillStyle = withAlpha(Math.random() > 0.75 ? "#a53b22" : "#120807", 0.12 + Math.random() * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255, 101, 32, 0.64)";
  for (let i = 0; i < 40; i += 1) {
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j += 1) {
      x += (Math.random() - 0.5) * 110;
      y += (Math.random() - 0.5) * 110;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 24; i += 1) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.strokeStyle = "rgba(96, 255, 217, 0.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(18, 0);
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 18);
    ctx.moveTo(-13, -13);
    ctx.lineTo(13, 13);
    ctx.stroke();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function withAlpha(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isTouchDevice() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}
