import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../../vendor/three-vrm/three-vrm.module.min.js';

const files = {
  muse: 'garden-muse.vrm',
  wanderer: 'shore-wanderer.vrm',
  keeper: 'letter-keeper.vrm',
};
const downloads = new Map();
function avatarKind(id = '') {
  if (id === 'wenxi' || id === 'forest-post') return 'muse';
  if (id === 'shiyi' || id === 'self-view') return 'wanderer';
  if (id === 'post') return 'keeper';
  const hash = Array.from(id).reduce((sum, c) => sum + c.codePointAt(0), 0);
  return ['muse', 'wanderer', 'keeper'][hash % 3];
}
function dataFor(kind) {
  if (!downloads.has(kind)) {
    const url = new URL('../../assets/models/' + files[kind], import.meta.url).href;
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error('人物素材暂时未能载入');
      return response.arrayBuffer();
    });
    downloads.set(kind, request);
    request.catch(() => downloads.delete(kind));
  }
  return downloads.get(kind);
}

// A new VRM is parsed for each resident so expressions, skeletons and memories never
// share animation state. Only the immutable network bytes are shared.
export async function loadAvatar(id) {
  const bytes = await dataFor(avatarKind(id));
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes, '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('人物素材缺少可用骨骼');
  VRMUtils.rotateVRM0(vrm);
  // The samples contain skirt/hair springs authored at a different scale.
  // Preserve their rest shape here; skeletal motion remains fully animated.
  vrm.springBoneManager?.reset();
  vrm.springBoneManager = undefined;
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  vrm.scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.every((mat) => mat.isOutline)) object.visible = false;
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = false;
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      if ('outlineWidthFactor' in mat) mat.outlineWidthFactor *= 0.45;
    }
  });
  vrm.update(0);
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const height = Math.max(0.1, box.max.y - box.min.y);
  vrm.scene.scale.setScalar(1.7 / height);
  vrm.scene.position.y = -box.min.y * (1.7 / height);
  return vrm;
}

const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const clamp = THREE.MathUtils.clamp;
export function animateAvatar(vrm, dt, state, group, clock) {
  const { motion = 0, carry = 0, talking = 0, embrace = 0, posing = 0, lookAt } = state;
  const bones = vrm.humanoid;
  const set = (bone, x = 0, y = 0, z = 0) => {
    const node = bones.getNormalizedBoneNode(bone);
    if (node) node.rotation.set(x, y, z);
  };
  const swing = Math.sin(clock * 7.6) * 0.43 * motion;
  const stride = Math.cos(clock * 7.6);
  set('leftUpperLeg', swing);
  set('rightUpperLeg', -swing);
  set('leftLowerLeg', Math.max(0, stride) * 0.38 * motion);
  set('rightLowerLeg', Math.max(0, -stride) * 0.38 * motion);
  set('leftFoot', -Math.max(0, stride) * 0.08 * motion);
  set('rightFoot', -Math.max(0, -stride) * 0.08 * motion);
  set(
    'leftUpperArm',
    -swing * 0.55 - carry * 0.8 - embrace * 1.05,
    embrace * -0.15,
    1.25 - embrace * 0.75 - posing * 0.08,
  );
  set(
    'rightUpperArm',
    swing * 0.55 - carry * 0.92 - embrace * 1.05 - posing * 1.12,
    embrace * 0.15 - posing * 0.2,
    -1.25 + embrace * 0.75 + posing * 0.55,
  );
  set('leftLowerArm', -0.12 - carry * 0.22 - embrace * 0.15, 0.08 + embrace * 0.55);
  set(
    'rightLowerArm',
    -0.12 - carry * 0.22 - embrace * 0.15 - posing * 0.75,
    -0.08 - embrace * 0.55 - posing * 0.6,
  );
  set('leftHand', 0, -0.06, -0.06);
  set('rightHand', -posing * 0.3, posing * 0.2, 0.06);
  set('spine', Math.sin(clock * 1.6) * 0.008, Math.sin(clock * 0.65) * 0.013, posing * 0.035);
  set('chest', -embrace * 0.045);
  let heading = 0;
  if (lookAt)
    heading = clamp(
      wrap(Math.atan2(lookAt.x - group.position.x, lookAt.z - group.position.z) - group.rotation.y),
      -0.48,
      0.48,
    );
  set('neck', 0, heading * 0.25);
  set(
    'head',
    Math.sin(clock * 2.3) * 0.015 + talking * Math.sin(clock * 4.5) * 0.025,
    heading * 0.75,
    posing * 0.055,
  );
  // Relax all fingers. During a portrait gesture the index and middle stay open.
  for (const side of ['left', 'right']) {
    for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
      const curl =
        side === 'right' && posing > 0.2 && ['Ring', 'Little'].includes(finger)
          ? 1.0 * posing
          : 0.12;
      const sign = side === 'left' ? -1 : 1;
      for (const section of ['Proximal', 'Intermediate', 'Distal'])
        set(side + finger + section, 0, 0, curl * sign);
    }
  }
  const expressions = vrm.expressionManager;
  if (expressions) {
    const blinkPhase = clock % 4.9;
    expressions.setValue(
      'blink',
      blinkPhase > 4.72 ? Math.sin(((blinkPhase - 4.72) / 0.18) * Math.PI) : 0,
    );
    expressions.setValue('aa', talking * Math.max(0, Math.sin(clock * 10)) * 0.32);
    expressions.setValue('happy', Math.max(embrace * 0.35, posing * 0.27));
  }
  vrm.update(dt);
}

export function disposeAvatar(vrm) {
  VRMUtils.deepDispose(vrm.scene);
}
