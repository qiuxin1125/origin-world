import * as THREE from '../../vendor/three/three.module.js';
import { loadAvatar, animateAvatar, disposeAvatar } from './avatars.js';

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...options });
}

function mesh(parent, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function sphere(parent, radius, mat, position, scale = [1, 1, 1]) {
  const object = mesh(parent, new THREE.SphereGeometry(radius, 12, 10), mat, position);
  object.scale.set(...scale);
  return object;
}

function cylinder(parent, top, bottom, height, mat, position, rotation, segments = 12) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(top, bottom, height, segments),
    mat,
    position,
    rotation,
  );
}

function capsule(parent, radius, length, mat, position, rotation = [0, 0, 0]) {
  return mesh(parent, new THREE.CapsuleGeometry(radius, length, 4, 10), mat, position, rotation);
}

function createNameplate(name, initialStatus) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(0, 1.96, 0);
  sprite.scale.set(0.8, 0.225, 1);
  let previousStatus = null;
  function setLabel(status = '') {
    if (status === previousStatus) return;
    previousStatus = status;
    ctx.clearRect(0, 0, 512, 144);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 36;
    do {
      ctx.font = `600 ${size}px "PingFang SC",system-ui,sans-serif`;
      if (ctx.measureText(name).width <= 440) break;
      size -= 2;
    } while (size > 20);
    ctx.strokeStyle = 'rgba(250,253,255,.9)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeText(name, 256, 52);
    ctx.fillStyle = '#38566b';
    ctx.fillText(name, 256, 52);
    if (status && !['自主行动', '在这里生活', '由你创建'].includes(status)) {
      ctx.font = '22px "PingFang SC",system-ui,sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(status, 256, 102, 440);
      ctx.fillStyle = '#607c8a';
      ctx.fillText(status, 256, 102, 440);
    }
    texture.needsUpdate = true;
  }
  setLabel(initialStatus);
  return { sprite, setLabel, texture };
}

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const mat of list) {
      materials.add(mat);
      if (mat.map) textures.add(mat.map);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const mat of materials) mat.dispose();
  for (const texture of textures) texture.dispose();
  group.removeFromParent();
}

export function createActor({ id, name = '来客', position = [0, 0], owned = false } = {}) {
  const group = new THREE.Group();
  group.name = `actor-${id || name}`;
  group.userData.actorId = id;
  group.userData.avatarReady = false;
  group.position.set(position[0], 0, position[1]);
  const nameplate = createNameplate(name, owned ? '由你创建' : '在这里生活');
  group.add(nameplate.sprite);
  const waiting = new THREE.Group();
  waiting.position.y = 0.9;
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.065, 0.006, 6, 32),
    new THREE.MeshBasicMaterial({ color: '#d9e9ee', transparent: true, opacity: 0.7 }),
  );
  waiting.add(glow);
  group.add(waiting);
  let avatar = null;
  let disposed = false;
  let phase = 0;
  let baseY = 0;
  const animation = { motion: 0, carry: 0, talking: 0, embrace: 0, posing: 0 };
  const emptyBone = new THREE.Group();
  const ready = loadAvatar(id)
    .then((loaded) => {
      if (disposed) {
        disposeAvatar(loaded);
        return null;
      }
      avatar = loaded;
      baseY = avatar.scene.position.y;
      group.add(avatar.scene);
      disposeGroup(waiting);
      group.userData.avatarReady = true;
      // Set an ordinary standing pose before the first render of the loaded mesh.
      animateAvatar(avatar, 0, animation, group, phase);
      return avatar;
    })
    .catch((error) => {
      group.userData.avatarError = error.message;
      nameplate.setLabel('正在等待抵达');
      return null;
    });
  function update(
    dt,
    { walking = false, talking = false, carrying = false, lookAt, pose, affectionate = false } = {},
  ) {
    const step = Math.min(0.05, Math.max(0, dt));
    phase += step;
    const ease = 1 - Math.exp(-step * 9);
    for (const [key, value] of Object.entries({
      motion: walking ? 1 : 0,
      carry: carrying ? 1 : 0,
      talking: talking ? 1 : 0,
      embrace: pose === 'hug' || affectionate ? 1 : 0,
      posing: pose === 'photoTogether' ? 1 : 0,
    }))
      animation[key] += (value - animation[key]) * ease;
    animation.lookAt = lookAt;
    if (avatar) {
      avatar.scene.position.y =
        baseY +
        Math.sin(phase * 1.6) * 0.004 +
        Math.abs(Math.sin(phase * 7.6)) * 0.012 * animation.motion;
      animateAvatar(avatar, step, animation, group, phase);
    } else {
      waiting.rotation.y += step * 0.7;
      glow.material.opacity = 0.35 + Math.sin(phase * 2) * 0.2;
    }
  }
  return {
    group,
    ready,
    update,
    get head() {
      return avatar?.humanoid.getNormalizedBoneNode('head') || emptyBone;
    },
    get leftArm() {
      return avatar?.humanoid.getNormalizedBoneNode('leftUpperArm') || emptyBone;
    },
    get rightArm() {
      return avatar?.humanoid.getNormalizedBoneNode('rightUpperArm') || emptyBone;
    },
    setLabel: nameplate.setLabel,
    showLabel: (visible) => {
      nameplate.sprite.visible = visible;
    },
    dispose: () => {
      disposed = true;
      if (avatar) {
        avatar.scene.removeFromParent();
        disposeAvatar(avatar);
      }
      disposeGroup(group);
    },
  };
}

function makePaperTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9d9ae';
  ctx.fillRect(0, 0, 640, 440);
  ctx.strokeStyle = '#789086';
  ctx.lineWidth = 2;
  for (let i = 0; i < 11; i++) {
    ctx.beginPath();
    for (let x = 20; x <= 620; x += 8) {
      const y = 80 + i * 24 + Math.sin(x * 0.014 + i * 0.25) * 22 + Math.sin(x * 0.03) * 10;
      if (x === 20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#8e6e48';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 592, 392);
  ctx.fillStyle = '#665c48';
  ctx.font = '600 25px "Songti SC",serif';
  ctx.fillText(kind === 'rubbing' ? '第七码头 · 潮线拓片' : '海岸记录', 43, 62);
  ctx.font = '18px "PingFang SC",sans-serif';
  ctx.fillText('一段被共同记住的岸线', 43, 388);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createHandObject(kind = 'photo', assetPath) {
  const group = new THREE.Group();
  group.name = `held-${kind}`;
  group.userData.kind = kind;
  const cream = material('#f1e6cf');
  const skin = material('#ddb495');
  if (kind === 'camera') {
    const bodyMat = material('#37443f', { roughness: 0.6, metalness: 0.2 });
    mesh(group, new THREE.BoxGeometry(0.35, 0.23, 0.15), bodyMat, [0, 0, 0]);
    mesh(group, new THREE.BoxGeometry(0.35, 0.025, 0.153), cream, [0, 0.09, 0]);
    cylinder(
      group,
      0.09,
      0.09,
      0.11,
      material('#242d2b', { roughness: 0.35 }),
      [0, 0.005, -0.12],
      [Math.PI / 2, 0, 0],
    );
    cylinder(
      group,
      0.065,
      0.065,
      0.012,
      material('#729f9d', { metalness: 0.65, roughness: 0.15 }),
      [0, 0.005, -0.182],
      [Math.PI / 2, 0, 0],
    );
    cylinder(group, 0.025, 0.025, 0.024, cream, [0.105, 0.128, 0.005]);
    mesh(
      group,
      new THREE.BoxGeometry(0.055, 0.035, 0.024),
      material('#1f2e2c'),
      [-0.1, 0.055, 0.088],
    );
    mesh(
      group,
      new THREE.BoxGeometry(0.095, 0.06, 0.005),
      material('#798d77'),
      [0.027, -0.025, 0.079],
    );
    capsule(group, 0.044, 0.115, skin, [0.171, -0.063, 0.015], [0, 0, -0.2]);
    capsule(group, 0.042, 0.1, skin, [-0.173, -0.063, 0.014], [0, 0, 0.2]);
    group.rotation.set(-0.06, -0.08, -0.03);
  } else {
    const width = kind === 'rubbing' ? 0.43 : 0.4;
    const height = kind === 'rubbing' ? 0.31 : 0.3;
    mesh(group, new THREE.BoxGeometry(width, height, 0.009), cream, [0, 0, 0]);
    const imageMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    if (kind === 'rubbing') imageMaterial.map = makePaperTexture(kind);
    else {
      const imageUrl = assetPath || new URL('../../assets/tide.webp', import.meta.url).href;
      const texture = new THREE.TextureLoader().load(imageUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      imageMaterial.map = texture;
    }
    mesh(
      group,
      new THREE.PlaneGeometry(width - 0.035, height - 0.055),
      imageMaterial,
      [0, 0.008, 0.006],
    );
    capsule(group, 0.036, 0.045, skin, [width * 0.49, -0.075, 0.025], [0, 0, -0.18]);
    capsule(group, 0.031, 0.12, skin, [width * 0.51, -0.17, -0.015], [0, 0, -0.35]);
    group.rotation.set(0.04, -0.06, -0.07);
  }
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  group.userData.dispose = () => disposeGroup(group);
  return group;
}
