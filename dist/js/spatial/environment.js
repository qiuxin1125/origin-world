import * as THREE from '../../vendor/three/three.module.js';

const palette = {
  plaster: '#f6f7f4',
  pale: '#fafbf8',
  wood: '#a9bbb8',
  woodLight: '#e8e7df',
  pine: '#709095',
  leaf: '#789c8b',
  moss: '#a9bca3',
  blue: '#8eb9c9',
  peach: '#cfaeaf',
  brass: '#b7a36f',
  ink: '#566d72',
  stone: '#d7e1dc',
};
const textureLoader = new THREE.TextureLoader();
const imageCache = new Map();
function imageTexture(name) {
  if (!imageCache.has(name)) {
    const texture = textureLoader.load(
      new URL('../../assets/' + name + '.webp', import.meta.url).href,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    imageCache.set(name, texture);
  }
  return imageCache.get(name);
}
function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.68, ...options });
}
function box(parent, w, h, d, x, y, z, mat, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, rt, rb, h, x, y, z, mat, sides = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, sides), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function ball(parent, r, x, y, z, mat, scale = [1, 1, 1], shadows = true) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  mesh.castShadow = mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}
function textCanvas(
  text,
  width = 1024,
  height = 256,
  color = '#31483b',
  background = '#f2ecd7',
  small = '',
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  c.fillStyle = background;
  c.fillRect(0, 0, width, height);
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font =
    '500 ' + Math.floor(height * (small ? 0.32 : 0.37)) + 'px "Songti SC","PingFang SC",serif';
  c.fillText(text, width / 2, height * (small ? 0.4 : 0.5), width * 0.92);
  if (small) {
    c.globalAlpha = 0.72;
    c.font = Math.floor(height * 0.12) + 'px "PingFang SC",sans-serif';
    c.fillText(small, width / 2, height * 0.77, width * 0.88);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function sign(parent, text, x, y, z, width, height, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: textCanvas(
        text,
        1024,
        Math.max(200, Math.round((1024 * height) / width)),
        options.color,
        options.background,
        options.small,
      ),
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = options.rotation || 0;
  parent.add(mesh);
  return mesh;
}
function plant(parent, x, z, size = 1, type = 'bush') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(size);
  parent.add(group);
  const pot = material(type === 'bush' ? '#dce4dc' : '#e8e9e2');
  cylinder(group, 0.29, 0.2, 0.49, 0, 0.245, 0, pot);
  cylinder(group, 0.27, 0.27, 0.045, 0, 0.5, 0, material('#7d8d78'));
  const stem = material('#83a08e'),
    leaf = material('#8aa897');
  const leafLight = material('#b5c8b4');
  if (type === 'bush') {
    cylinder(group, 0.025, 0.035, 1.2, 0, 1, 0, stem, 7);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.35,
        yy = 0.75 + i * 0.12;
      const l = ball(
        group,
        0.18,
        Math.cos(a) * 0.26,
        yy,
        Math.sin(a) * 0.25,
        i % 2 ? leaf : leafLight,
        [1.6, 0.45, 0.85],
      );
      l.rotation.set(0.1, a, 0.35);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      const l = ball(
        group,
        0.23,
        Math.cos(angle) * 0.18,
        0.9 + (i % 3) * 0.18,
        Math.sin(angle) * 0.18,
        i % 2 ? leaf : leafLight,
        [0.55, 2.4, 0.45],
      );
      l.rotation.set(Math.sin(angle) * 0.3, 0, Math.cos(angle) * 0.3);
    }
  }
  return group;
}
let leafTexture;
function foliageTexture() {
  if (leafTexture) return leafTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath();
  x.moveTo(6, 64);
  x.bezierCurveTo(42, 7, 98, 24, 121, 64);
  x.bezierCurveTo(94, 110, 42, 117, 6, 64);
  const g = x.createLinearGradient(0, 22, 0, 105);
  g.addColorStop(0, '#d1dfbc');
  g.addColorStop(0.5, '#b4cba0');
  g.addColorStop(1, '#7eab83');
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = '#9bb98f66';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(7, 64);
  x.lineTo(120, 64);
  x.stroke();
  for (let i = 1; i < 6; i++) {
    x.beginPath();
    x.moveTo(i * 17 + 10, 64);
    x.lineTo(i * 17 + 20, 40 + (i % 3) * 3);
    x.moveTo(i * 17 + 10, 64);
    x.lineTo(i * 17 + 20, 88 - (i % 3) * 3);
    x.stroke();
  }
  leafTexture = new THREE.CanvasTexture(c);
  leafTexture.colorSpace = THREE.SRGBColorSpace;
  return leafTexture;
}
let sprayMaterial;
function flowerSpray(parent, x, y, z, width = 3, rotation = 0) {
  if (!sprayMaterial)
    sprayMaterial = new THREE.MeshBasicMaterial({
      map: imageTexture('wisteria-spray'),
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.3,
      depthWrite: true,
      toneMapped: false,
    });
  const spray = new THREE.Mesh(new THREE.PlaneGeometry(width, width), sprayMaterial);
  spray.position.set(x, y, z);
  spray.rotation.y = rotation;
  spray.castShadow = false;
  spray.receiveShadow = true;
  parent.add(spray);
  return spray;
}
function tree(parent, x, z, size = 1, pine = false) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(size);
  parent.add(group);
  const bark = material('#a6a39b');
  cylinder(group, 0.09, 0.18, 2.7, 0, 1.35, 0, bark, 12);
  const amount = pine ? 1100 : 1500;
  const foliage = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    material('#ffffff', {
      map: foliageTexture(),
      alphaTest: 0.3,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
    amount,
  );
  const m = new THREE.Object3D();
  const tones = pine
    ? ['#587e70', '#6e9681', '#8dac92']
    : ['#6d927b', '#89ab89', '#a0bb98', '#7ba88b', '#b6cba3'];
  for (let branch = 0; branch < 6; branch++) {
    const a = branch * 2.399,
      spread = 0.75 + (branch % 3) * 0.3;
    const end = new THREE.Vector3(
      Math.cos(a) * spread,
      3.0 + (branch % 3) * 0.45,
      Math.sin(a) * spread,
    );
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 1.65, 0),
      new THREE.Vector3(end.x * 0.25, 2.9, end.z * 0.25),
      end,
    );
    const twig = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.035, 5, false), bark);
    group.add(twig);
  }
  for (let i = 0; i < amount; i++) {
    const a = i * 2.39996,
      r = Math.sqrt(((i * 37) % amount) / amount) * (pine ? 1.3 : 1.7);
    const y = 3.1 + Math.sqrt(Math.max(0, 1 - (r * r) / 3.0)) * 0.92 + Math.sin(i * 1.37) * 0.32;
    m.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.82);
    m.rotation.set(Math.sin(i) * 1.3, a, Math.cos(i * 0.73) * 1.4);
    const length = 0.095 + (i % 6) * 0.012;
    m.scale.set(length * 1.3, length * 0.62, 1);
    m.updateMatrix();
    foliage.setMatrixAt(i, m.matrix);
    foliage.setColorAt(i, new THREE.Color(tones[i % tones.length]));
  }
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  group.add(foliage);
  if (!pine) {
    for (let i = 0; i < 3; i++)
      flowerSpray(group, Math.cos(i * 2.1) * 0.8, 2.95, Math.sin(i * 2.1) * 0.8, 2.0, i * 2.1);
  }
}
function curveTube(parent, points, mat, radius = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 7, false), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function windowArch(parent, x, z, w = 2.15, base = 0.85, height = 3.1, rotation = 0) {
  const frame = new THREE.Group();
  frame.position.set(x, 0, z);
  frame.rotation.y = rotation;
  parent.add(frame);
  const radius = w / 2,
    spring = base + height - radius;
  const metal = material('#7799a5', { metalness: 0.32, roughness: 0.4 });
  const shape = new THREE.Shape();
  shape.moveTo(-radius, base);
  shape.lineTo(radius, base);
  shape.lineTo(radius, spring);
  shape.absarc(0, spring, radius, 0, Math.PI, false);
  shape.lineTo(-radius, base);
  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 32),
    new THREE.MeshStandardMaterial({
      color: '#c4dfe3',
      transparent: true,
      opacity: 0.15,
      roughness: 0.18,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  frame.add(glass);
  const arc = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI;
    arc.push([Math.cos(a) * radius, spring + Math.sin(a) * radius, 0]);
  }
  curveTube(frame, arc, metal, 0.04);
  for (const xx of [-radius, 0, radius])
    cylinder(frame, 0.027, 0.027, spring - base, xx, (spring + base) / 2, 0, metal, 8);
  box(frame, w, 0.045, 0.055, 0, base, 0, metal);
  box(frame, w, 0.035, 0.05, 0, spring - 0.5, 0, metal);
  return frame;
}
function barrelRoof(parent, x, z, width, depth, base, rise) {
  const metal = material('#819eaa', { metalness: 0.28, roughness: 0.42 });
  const white = material('#eff2ee');
  const verts = [],
    uvs = [],
    indices = [];
  const steps = 36;
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= steps; i++) {
      const angle = (Math.PI * i) / steps;
      verts.push(
        x + (Math.cos(angle) * width) / 2,
        base + Math.sin(angle) * rise,
        z + (side ? depth / 2 : -depth / 2),
      );
      uvs.push(i / steps, side);
    }
  for (let i = 0; i < steps; i++) {
    const a = i,
      b = i + steps + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: '#d8e9ed',
      transparent: true,
      opacity: 0.12,
      roughness: 0.2,
      metalness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  parent.add(glass);
  for (let row = 0; row <= 6; row++) {
    const zz = z - depth / 2 + (row * depth) / 6,
      points = [];
    for (let i = 0; i <= 32; i++) {
      const a = (Math.PI * i) / 32;
      points.push([x + (Math.cos(a) * width) / 2, base + Math.sin(a) * rise, zz]);
    }
    curveTube(
      parent,
      points,
      row === 0 || row === 6 ? white : metal,
      row === 0 || row === 6 ? 0.11 : 0.042,
    );
  }
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI * i) / 6;
    box(
      parent,
      0.04,
      0.04,
      depth,
      x + (Math.cos(a) * width) / 2,
      base + Math.sin(a) * rise,
      z,
      metal,
    );
  }
  for (const xx of [-width / 2, width / 2]) {
    box(parent, 0.2, 0.25, depth + 0.3, x + xx, base, z, white);
    box(
      parent,
      0.045,
      0.045,
      depth + 0.4,
      x + xx,
      base + 0.16,
      z,
      material('#c5b18b', { metalness: 0.4, roughness: 0.35 }),
    );
  }
}
function picture(parent, x, y, z, width, height, name, border = '#b4aa8c') {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  parent.add(frame);
  box(frame, width + 0.15, height + 0.15, 0.1, 0, 0, 0, material(border));
  box(frame, width, height, 0.016, 0, 0, 0.062, material('#fafaf4'));
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.9, height * 0.87),
    new THREE.MeshStandardMaterial({ map: imageTexture(name), roughness: 0.95 }),
  );
  art.position.z = 0.075;
  art.name = 'frame-art';
  frame.add(art);
  return frame;
}
function bench(parent, x, z, angle = 0, color = '#abc0c3') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  parent.add(g);
  const frame = material('#d7ddd3', { metalness: 0.25, roughness: 0.4 }),
    upholstery = material(color, { roughness: 0.9 });
  box(g, 1.6, 0.1, 0.63, 0, 0.43, 0, frame);
  const seat = ball(g, 0.5, 0, 0.53, 0, upholstery, [1.56, 0.17, 0.6]);
  const back = ball(g, 0.5, 0, 0.97, -0.27, upholstery, [1.55, 0.76, 0.16]);
  for (const xx of [-0.66, 0.66]) {
    for (const zz of [-0.23, 0.23]) cylinder(g, 0.026, 0.04, 0.43, xx, 0.22, zz, frame, 8);
    curveTube(
      g,
      [
        [xx, 0.55, 0.27],
        [xx, 0.75, 0.22],
        [xx, 0.78, -0.16],
        [xx, 0.56, -0.25],
      ],
      frame,
      0.025,
    );
  }
  return g;
}
function frameStand(parent, x, z, text) {
  const wood = material('#a8bcbb');
  cylinder(parent, 0.045, 0.045, 0.9, x, 0.45, z, wood, 8);
  const stand = box(parent, 0.8, 0.42, 0.06, x, 1.05, z, wood);
  sign(parent, text, x, 1.05, z + 0.034, 0.73, 0.35, { small: '源界 · 群岛' });
  return stand;
}
function water(parent, color = '#91bfc8') {
  const uniforms = { time: { value: 0 }, sea: { value: new THREE.Color(color) } };
  const shader = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:
      'varying vec3 p; varying vec3 w; void main(){p=position;w=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float time;uniform vec3 sea;varying vec3 p;varying vec3 w;
      float noise(vec2 q){return sin(q.x*.7+sin(q.y*.3+time*.18))*sin(q.y*.54-time*.15);}
      void main(){vec3 v=normalize(cameraPosition-w);float fres=pow(1.0-max(v.y,0.0),2.4);
        float n=noise(p.xy);float ripple=pow(max(0.0,sin(p.x*.75+p.y*.95+n*2.1-time*.5)),28.0);
        vec3 c=mix(sea*.85,vec3(.18,.39,.56),fres*.8)+vec3(.16,.19,.18)*ripple*(1.0-fres)*.4;
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), shader);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.24;
  parent.add(mesh);
  return uniforms;
}
function pastelSky(parent, forest = false) {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(forest ? '#a8cbdc' : '#8cbfe0') },
      horizon: { value: new THREE.Color('#c5deef') },
    },
    vertexShader:
      'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 zenith;uniform vec3 horizon;varying vec3 direction;void main(){vec3 d=normalize(direction);float h=smoothstep(-.06,.48,d.y);vec3 c=mix(horizon,zenith,h);float sun=pow(max(dot(d,normalize(vec3(-.45,.48,.65))),0.0),62.0);c+=vec3(.13,.12,.085)*sun;gl_FragColor=vec4(c,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>}`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 32, 24), skyMaterial);
  sky.renderOrder = -10;
  parent.add(sky);
}
function clouds(parent) {
  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 256;
  const ctx = cvs.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 75 + i * 43,
      y = 130 + Math.sin(i * 2.1) * 18,
      r = 40 + (i % 3) * 12;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.5)');
    g.addColorStop(0.55, 'rgba(255,255,255,.27)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(cvs);
  texture.colorSpace = THREE.SRGBColorSpace;
  const cloudMat = new THREE.SpriteMaterial({
    map: texture,
    opacity: 0.94,
    depthWrite: false,
    fog: false,
    color: '#ffffff',
    toneMapped: false,
  });
  [
    [-44, 27, -77, 50],
    [37, 31, -96, 65],
    [75, 22, -21, 46],
    [-76, 21, 10, 55],
    [28, 30, 92, 65],
    [-49, 20, 73, 50],
  ].forEach(([x, y, z, w]) => {
    const cloud = new THREE.Sprite(cloudMat);
    cloud.position.set(x, y, z);
    cloud.scale.set(w, w * 0.4, 1);
    parent.add(cloud);
  });
}
function flowerGarden(parent, forest = false) {
  const beds = [
    [-4.1, 8.1],
    [4.1, 8.1],
    [-7.65, 2.2],
    [7.65, -2.8],
    [-7.8, -6.4],
    [7.8, 5.4],
    [-5.8, 10.5],
    [5.8, 10.5],
    [-9.2, 10.8],
    [9.5, 10.8],
    [-12, -7.5],
    [12.8, 5.2],
    [12.8, -2.2],
    [-9.4, 4.8],
    [-8.5, -15.4],
    [5.7, -15.8],
    [-3.7, 14.9],
    [3.7, 14.9],
    [-6.8, 14.6],
    [6.8, 14.6],
  ];
  const perBed = 46;
  const count = beds.length * perBed;
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.016, 1, 5),
    material('#7d9d88'),
    count,
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 4),
    material('#94b19b'),
    count,
  );
  const petals = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 7, 5),
    material('#fff4ed', { roughness: 0.72 }),
    count * 5,
  );
  const centers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 7, 5),
    material('#d8bb77'),
    count,
  );
  const transform = new THREE.Object3D();
  const tones = forest
    ? ['#f8efe5', '#ecd9f0', '#f2c2d0']
    : ['#d59ab5', '#f2eadc', '#899fc8', '#b49dcb', '#dfb4c9'];
  let flower = 0;
  for (const [bx, bz] of beds) {
    for (let i = 0; i < perBed; i++) {
      const angle = i * 2.399;
      const distance = 0.17 + Math.sqrt(i / perBed) * 1.0;
      const x = bx + Math.cos(angle) * distance,
        z = bz + Math.sin(angle) * distance;
      const h = 0.22 + (i % 7) * 0.048;
      transform.position.set(x, h / 2, z);
      transform.rotation.set(0, 0, 0.06 * Math.sin(i));
      transform.scale.set(1, h, 1);
      transform.updateMatrix();
      stems.setMatrixAt(flower, transform.matrix);
      transform.position.set(x + 0.045, h * 0.47, z);
      transform.rotation.set(0.4, angle, 0.35);
      transform.scale.set(0.095, 0.016, 0.043);
      transform.updateMatrix();
      leaves.setMatrixAt(flower, transform.matrix);
      for (let petal = 0; petal < 5; petal++) {
        const pa = (petal * Math.PI * 2) / 5;
        transform.position.set(x + Math.cos(pa) * 0.052, h + 0.012, z + Math.sin(pa) * 0.052);
        transform.rotation.set(0.12, pa, 0.1);
        transform.scale.set(0.073, 0.022, 0.044);
        transform.updateMatrix();
        petals.setMatrixAt(flower * 5 + petal, transform.matrix);
        petals.setColorAt(flower * 5 + petal, new THREE.Color(tones[i % tones.length]));
      }
      transform.position.set(x, h + 0.026, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.027, 0.021, 0.027);
      transform.updateMatrix();
      centers.setMatrixAt(flower, transform.matrix);
      flower++;
    }
  }
  stems.castShadow = false;
  petals.castShadow = false;
  leaves.castShadow = false;
  centers.castShadow = false;
  parent.add(stems, leaves, petals, centers);
}
function driftingPetals(parent) {
  const count = 32;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = i * 2.399;
    positions[i * 3] = Math.sin(phases[i]) * 8;
    positions[i * 3 + 1] = 0.3 + (i % 11) * 0.42;
    positions[i * 3 + 2] = Math.cos(phases[i] * 0.7) * 10;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,237,224,1)');
  gradient.addColorStop(0.4, 'rgba(248,201,205,.8)');
  gradient.addColorStop(1, 'rgba(248,201,205,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: texture,
      color: '#ffebdf',
      size: 0.13,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  parent.add(points);
  return (dt, time) => {
    for (let i = 0; i < count; i++) {
      positions[i * 3] += Math.sin(time * 0.23 + phases[i]) * 0.018 * dt;
      positions[i * 3 + 1] -= 0.055 * dt;
      if (positions[i * 3 + 1] < 0.15) positions[i * 3 + 1] = 4.8;
    }
    geometry.attributes.position.needsUpdate = true;
  };
}
function skyIslands(parent, tone = '#8eaab6') {
  // Broad, layered coastlines replace the old cones and soften the distant horizon.
  const coordinates = [
    [-48, -69, 23, 13],
    [-81, -94, 32, 18],
    [55, -91, 32, 17],
    [88, -40, 28, 12],
    [-89, 29, 33, 12],
    [48, 89, 37, 10],
    [1, 57, 17, 8],
  ];
  coordinates.forEach(([x, z, r, h], index) => {
    const rockMat = material('#a2b8bc', { roughness: 1, vertexColors: true });
    const steps = 36,
      vertices = [],
      colors = [],
      indices = [];
    for (let row = 0; row <= steps; row++)
      for (let col = 0; col <= steps; col++) {
        const xx = (col / steps - 0.5) * 2,
          zz = (row / steps - 0.5) * 2,
          rad = Math.sqrt(xx * xx + zz * zz);
        const ridge =
          1 + Math.sin(xx * 9 + zz * 4 + index) * 0.12 + Math.sin(zz * 12 - xx * 3) * 0.07;
        const shape = Math.max(0, 1 - rad * rad * ridge);
        const hill =
          shape > 0
            ? Math.pow(shape, 1.55) *
              (0.56 + 0.2 * Math.sin(xx * 6 + index) + 0.16 * Math.sin(zz * 7 - xx * 2))
            : 0;
        const yy = hill * h - 0.3;
        vertices.push(x + xx * r, yy, z + zz * r * 0.68);
        const color = new THREE.Color(yy < 0.7 ? '#cbd4c4' : yy < h * 0.27 ? '#a7baac' : '#9bafa9');
        colors.push(color.r, color.g, color.b);
      }
    for (let row = 0; row < steps; row++)
      for (let col = 0; col < steps; col++) {
        const i = row * (steps + 1) + col;
        indices.push(i, i + steps + 1, i + 1, i + 1, i + steps + 1, i + steps + 2);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const island = new THREE.Mesh(geometry, rockMat);
    parent.add(island);
    // Fine pale spires make the far shore feel inhabited without a hard silhouette.
    if (index < 3) {
      for (let i = 0; i < 4; i++) {
        cylinder(
          parent,
          0.3,
          0.55,
          2.5 + (i % 3),
          x + (i - 1.5) * 2.1,
          h * (0.56 + 0.2 * Math.sin(index)) - 0.3 + (2.5 + (i % 3)) / 2,
          z,
          material('#dbe3e1'),
          12,
        );
      }
    }
  });
}
function lantern(parent, x, y, z) {
  const dark = material('#355347'),
    shade = material('#eee1ad', { emissive: '#d8bb71', emissiveIntensity: 0.2 });
  box(parent, 0.28, 0.42, 0.28, x, y, z, dark);
  box(parent, 0.22, 0.32, 0.29, x, y, z, shade);
  const point = new THREE.PointLight('#ffe2a3', 1.4, 4, 2);
  point.position.set(x, y, z);
  parent.add(point);
}
function portal(parent, id, x, z, label, color = '#8bc1ad') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  parent.add(group);
  const stone = material('#eaf0e9'),
    accent = material('#b6ac90', { metalness: 0.35, roughness: 0.4 });
  cylinder(group, 0.12, 0.2, 2.65, -1.24, 1.325, 0, stone, 20);
  cylinder(group, 0.12, 0.2, 2.65, 1.24, 1.325, 0, stone, 20);
  [-1.24, 1.24].forEach((xx) => {
    cylinder(group, 0.24, 0.24, 0.13, xx, 0.1, 0, stone, 20);
    cylinder(group, 0.22, 0.22, 0.12, xx, 2.6, 0, accent, 20);
  });
  const arc = [];
  for (let i = 0; i <= 32; i++) {
    const a = (Math.PI * i) / 32;
    arc.push([Math.cos(a) * 1.24, 2.6 + Math.sin(a) * 1.05, 0]);
  }
  curveTube(group, arc, stone, 0.14);
  curveTube(
    group,
    arc.map((p) => [p[0] * 0.92, p[1] - 0.08, p[2] + 0.08]),
    accent,
    0.022,
  );
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(2.12, 2.95),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  veil.position.y = 1.75;
  group.add(veil);
  const lines = new THREE.Group();
  group.add(lines);
  for (let i = 0; i < 10; i++) {
    const dot = ball(
      lines,
      0.035,
      Math.sin(i * 5) * 0.84,
      0.4 + i * 0.28,
      0.04,
      material('#e6f5d3', { emissive: '#b5ddaa', emissiveIntensity: 0.5 }),
      [1, 1, 1],
      false,
    );
    dot.userData.phase = i;
  }
  sign(group, label, 0, 4.04, 0.02, 2.7, 0.3, { background: '#edf2ed', color: '#7b949a' });
  group.userData.portalLines = lines;
  group.userData.veil = veil;
  group.userData.interactionId = id;
  return group;
}
function lighthouse(parent, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  parent.add(group);
  const ivory = material('#f1f1e8'),
    green = material('#849fa7'),
    glass = material('#d1e4e7', { roughness: 0.35 });
  cylinder(group, 1.15, 1.6, 0.5, 0, 0.25, 0, material('#d5ddd8'), 12);
  cylinder(group, 0.75, 1.1, 6, 0, 3.3, 0, ivory, 12);
  cylinder(group, 0.84, 0.84, 0.2, 0, 6.3, 0, green, 12);
  cylinder(group, 0.75, 0.75, 1.12, 0, 6.96, 0, glass, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    box(group, 0.06, 1.15, 0.06, Math.sin(a) * 0.73, 6.96, Math.cos(a) * 0.73, green);
  }
  cylinder(group, 0.9, 0.9, 0.15, 0, 7.55, 0, green, 12);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.85, 12), green);
  roof.position.y = 8;
  group.add(roof);
  box(group, 0.4, 1.1, 0.07, 0, 0.85, 1.02, green);
  sign(group, '潮汐', 0, 3.8, 1.05, 0.75, 0.55, { background: '#f0f1e9' });
  return group;
}
function surfaceTexture(kind) {
  if (kind === 'stone') {
    const map = imageTexture('moon-marble').clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    return map;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = kind === 'grass' ? '#b6c8b3' : '#f0f0e8';
  c.fillRect(0, 0, 512, 512);
  let seed = 5313;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < (kind === 'grass' ? 15000 : 4500); i++) {
    const v = rnd();
    c.fillStyle =
      kind === 'grass'
        ? `rgba(${v > 0.5 ? '78,113,89' : '225,231,203'},${rnd() * 0.14})`
        : `rgba(125,148,145,${rnd() * 0.06})`;
    const x = rnd() * 512,
      y = rnd() * 512;
    c.fillRect(x, y, kind === 'grass' ? 1 : 2, kind === 'grass' ? 2 + rnd() * 5 : 1);
  }
  if (kind !== 'grass') {
    c.strokeStyle = '#c7d1cb22';
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      let y = rnd() * 512;
      c.moveTo(0, y);
      for (let x = 0; x < 530; x += 35) c.lineTo(x, y + Math.sin(x * 0.018 + i) * 16);
      c.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(kind === 'grass' ? 8 : 3, kind === 'grass' ? 10 : 3);
  return map;
}
function enrichGround(parent, forest = false) {
  const grass = material(forest ? '#a6bca9' : '#b8cbb7', {
    map: surfaceTexture('grass'),
    roughness: 0.97,
  });
  box(parent, 31, 0.36, 37, 0.5, -0.2, -1.5, grass);
  const stone = material('#f0f1e9', { map: surfaceTexture('stone'), roughness: 0.78 });
  box(parent, 3.0, 0.035, 28, 8, -0.004, -1.5, stone);
  box(parent, 3.2, 0.03, 8, 0, -0.002, 11.2, stone);
  for (let i = 0; i < 7; i++)
    tree(parent, -12 + (i % 2) * 1.6, -15 + i * 4.6, 0.75 + (i % 3) * 0.15, forest);
  tree(parent, 13.6, 11.5, 0.98);
  tree(parent, -8.8, 12.6, 1.15);
  tree(parent, 12.8, -8.2, 0.88);
  const blades = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.035, 0.35),
    material('#91ac92', { side: THREE.DoubleSide, roughness: 1 }),
    1200,
  );
  const m = new THREE.Object3D();
  for (let i = 0; i < 1200; i++) {
    const side = i % 2 ? 1 : -1,
      x = side * (8.1 + ((i * 17) % 100) * 0.06),
      z = -17 + ((i * 37) % 150) * 0.2;
    m.position.set(x, 0.1, z);
    m.rotation.set(0.1 * Math.sin(i), i * 2.399, 0.1 * Math.cos(i));
    m.scale.set(1, 0.4 + (i % 7) * 0.11, 1);
    m.updateMatrix();
    blades.setMatrixAt(i, m.matrix);
  }
  parent.add(blades);
  // A quiet limestone shore gives the island an intentional edge instead of a grass slab.
  for (const x of [-15.05, 15.3]) box(parent, 0.24, 0.14, 37, x, -0.03, -1.5, material('#e1e7df'));
  box(parent, 30.5, 0.14, 0.24, 0.1, -0.03, 16.7, material('#e1e7df'));
}
function coastalTerrace(parent) {
  const ivory = material('#e6eee9'),
    gold = material('#b7a46e', { metalness: 0.2, roughness: 0.38 }),
    blue = material('#7b9ca9', { metalness: 0.2, roughness: 0.45 });
  box(parent, 27, 0.22, 0.5, 0, -0.11, 16.4, ivory);
  for (let x = -13; x <= 13; x += 1.3) {
    cylinder(parent, 0.045, 0.07, 0.92, x, 0.46, 16.4, ivory, 12);
    cylinder(parent, 0.075, 0.075, 0.055, x, 0.93, 16.4, gold, 12);
  }
  box(parent, 27, 0.055, 0.08, 0, 0.97, 16.4, blue);
  box(parent, 27, 0.035, 0.05, 0, 0.38, 16.4, ivory);
  // A moon gate and hanging flowers frame the sea beyond the parapet.
  const moon = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.075, 12, 96), ivory);
  moon.position.set(0, 2.55, 18.2);
  parent.add(moon);
  const line = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.018, 7, 96), gold);
  line.position.copy(moon.position);
  parent.add(line);
  flowerSpray(parent, -2, 3.38, 18.28, 3.0, -0.1);
  flowerSpray(parent, 2, 3.38, 18.28, 3.0, 0.1);
  tree(parent, -7.8, 18.6, 1.15);
  tree(parent, 7.8, 18.6, 1.15);
  bench(parent, -5.2, 14.8, 0.13, '#a9bfc8');
  bench(parent, 5.2, 14.8, -0.13, '#c8afb9');
}
function floorTiles(parent, x, z, w, d) {
  const tileMat = material('#f3f3ed', { roughness: 0.61, map: surfaceTexture('stone') });
  const geom = new THREE.BoxGeometry(1.96, 0.045, 0.97),
    cols = Math.floor(w / 2),
    rows = Math.floor(d);
  const tiles = new THREE.InstancedMesh(geom, tileMat, cols * rows),
    m = new THREE.Object3D();
  let n = 0;
  for (let ix = 0; ix < cols; ix++)
    for (let iz = 0; iz < rows; iz++) {
      m.position.set(x - w / 2 + ix * 2 + 1, 0.005, z - d / 2 + iz + 0.5);
      m.updateMatrix();
      tiles.setMatrixAt(n, m.matrix);
      tiles.setColorAt(n, new THREE.Color((ix + iz) % 4 === 0 ? '#e8eeeb' : '#f7f6ee'));
      n++;
    }
  tiles.receiveShadow = true;
  parent.add(tiles);
  return tileMat;
}
function makeOrigin(group, interactions, colliders) {
  const plaster = material(palette.plaster, { map: surfaceTexture('stone') }),
    wood = material(palette.wood),
    lightWood = material(palette.woodLight),
    pine = material(palette.pine);
  const gold = material(palette.brass, { metalness: 0.4, roughness: 0.32 });
  enrichGround(group);
  coastalTerrace(group);
  floorTiles(group, 0, 0.5, 14, 13);
  box(group, 14, 0.22, 13, 0, -0.13, 0.5, material('#dbe2dc'));
  // Moon-white conservatory: the same footprint and tangible doorway, with tall arched glazing.
  box(group, 14, 4.35, 0.24, 0, 2.175, -6, plaster);
  box(group, 0.24, 0.82, 13, -7, 0.41, 0.5, plaster);
  box(group, 0.2, 0.22, 13.4, -7, 4.2, 0.5, plaster);
  for (const zz of [-5.8, -1.6, 2.6, 6.8]) {
    cylinder(group, 0.11, 0.15, 4.2, -7, 2.1, zz, plaster, 16);
    cylinder(group, 0.19, 0.19, 0.15, -7, 0.1, zz, plaster, 16);
    cylinder(group, 0.18, 0.18, 0.12, -7, 4.08, zz, plaster, 16);
  }
  for (const zz of [-3.7, 0.5, 4.7]) windowArch(group, -6.98, zz, 3.8, 0.85, 3.05, Math.PI / 2);
  for (const side of [-1, 1]) {
    box(group, 5.75, 0.82, 0.24, side * 4.125, 0.41, 7, plaster);
    box(group, 5.75, 0.2, 0.3, side * 4.125, 4.2, 7, plaster);
    for (const xx of [2.55, 5.4]) windowArch(group, side * xx, 7.02, 2.35, 0.85, 3.1);
    for (const xx of [1.28, 4.0, 6.95]) {
      cylinder(group, 0.11, 0.145, 4.2, side * xx, 2.1, 7, plaster, 16);
      cylinder(group, 0.2, 0.2, 0.14, side * xx, 0.1, 7, plaster, 16);
      cylinder(group, 0.19, 0.19, 0.12, side * xx, 4.08, 7, plaster, 16);
      box(group, 0.045, 0.04, 0.36, side * xx, 3.95, 7, gold);
    }
  }
  // The open sea-facing side keeps its original passage and gains slender fluted columns.
  for (const zz of [-5.8, -1.9, 2, 6.7]) {
    cylinder(group, 0.12, 0.16, 4.2, 6.8, 2.1, zz, plaster, 20);
    cylinder(group, 0.22, 0.22, 0.14, 6.8, 0.1, zz, plaster, 20);
    cylinder(group, 0.2, 0.2, 0.1, 6.8, 4.1, zz, gold, 20);
  }
  barrelRoof(group, 0, 0.5, 14, 13.4, 4.3, 2.15);
  flowerSpray(group, -4.5, 3.92, 7.2, 3.8, -0.05);
  flowerSpray(group, 4.5, 3.92, 7.2, 3.8, 0.05);
  flowerSpray(group, 6.82, 3.75, 0.3, 3.2, Math.PI / 2);
  flowerSpray(group, -6.82, 3.75, 0.3, 3.2, Math.PI / 2);
  flowerSpray(group, -5.6, 3.72, -5.7, 2.3);
  flowerSpray(group, 5.6, 3.72, -5.7, 2.3);
  box(group, 14.6, 0.18, 0.32, 0, 4.24, 7.1, plaster);
  box(group, 14.7, 0.035, 0.37, 0, 4.36, 7.1, gold);
  sign(group, '群岛会客厅', 0, 4.02, 7.2, 2.65, 0.34, {
    small: '',
    background: '#f3f4ef',
    color: '#6e8589',
  });
  // Decorative fanlight rises over the rectangular working door.
  const fan = [];
  for (let i = 0; i <= 32; i++) {
    const a = (Math.PI * i) / 32;
    fan.push([Math.cos(a) * 1.27, 3.1 + Math.sin(a) * 0.75, 7.13]);
  }
  curveTube(group, fan, gold, 0.035);
  [-1.35, 1.35].forEach((x) => box(group, 0.13, 3.35, 0.27, x, 1.68, 7.03, plaster));
  box(group, 2.7, 0.055, 0.42, 0, 0.015, 7.2, lightWood);
  const door = new THREE.Group();
  door.position.set(-1.24, 0, 7.02);
  group.add(door);
  [0.09, 2.37].forEach((x) => box(door, 0.12, 3.28, 0.1, x, 1.64, 0, pine));
  [0.09, 3.19].forEach((y) => box(door, 2.46, 0.12, 0.1, 1.23, y, 0, pine));
  const glass = material('#c5e0e3', {
    transparent: true,
    opacity: 0.15,
    roughness: 0.2,
    metalness: 0.12,
    depthWrite: false,
  });
  box(door, 2.08, 2.65, 0.035, 1.23, 1.81, 0, glass, false);
  box(door, 2.2, 0.36, 0.13, 1.23, 0.26, 0, plaster);
  box(door, 0.045, 2.9, 0.12, 1.23, 1.67, 0, pine);
  box(door, 2.2, 0.045, 0.1, 1.23, 1.05, 0, pine);
  cylinder(door, 0.025, 0.025, 0.36, 2.14, 1.43, 0.15, gold, 12).rotation.z = Math.PI / 2;
  interactions.push({ id: 'door', kind: 'door', label: '推开会客厅的门', mesh: door, radius: 3.3 });
  colliders.push(
    { minX: -7.2, maxX: -6.8, minZ: -6.2, maxZ: 7.2 },
    { minX: -7, maxX: 7, minZ: -6.2, maxZ: -5.8 },
    { minX: -7, maxX: -1.28, minZ: 6.8, maxZ: 7.2 },
    { minX: 1.28, maxX: 7, minZ: 6.8, maxZ: 7.2 },
    { minX: -1.25, maxX: 1.25, minZ: 6.86, maxZ: 7.18, id: 'door' },
  );
  const table = new THREE.Group();
  group.add(table);
  box(table, 3.6, 0.16, 1.6, -2.2, 0.92, 0.3, lightWood);
  [-3.65, -0.75].forEach((x) =>
    [-0.24, 0.84].forEach((z) => box(table, 0.12, 0.9, 0.12, x, 0.43, z, wood)),
  );
  colliders.push({ minX: -4.05, maxX: -0.35, minZ: -0.55, maxZ: 1.15 });
  // A tangible photograph, lying on the table. Main controls a separate held copy.
  const photo = new THREE.Group();
  photo.position.set(-2.55, 1.014, 0.4);
  photo.rotation.x = -Math.PI / 2;
  photo.rotation.z = 0.15;
  group.add(photo);
  box(photo, 0.9, 0.65, 0.018, 0, 0, 0, material('#f1eadb'));
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.46),
    new THREE.MeshStandardMaterial({ map: imageTexture('tide'), side: THREE.DoubleSide }),
  );
  print.position.set(0, 0.04, 0.012);
  photo.add(print);
  interactions.push({
    id: 'photo',
    kind: 'photo',
    label: '拿起码头旧照',
    mesh: photo,
    radius: 2.4,
  });
  const camera = new THREE.Group();
  camera.position.set(-1.05, 1.09, 0.32);
  group.add(camera);
  box(camera, 0.38, 0.25, 0.16, 0, 0, 0, material('#394c46'));
  box(camera, 0.17, 0.1, 0.13, 0.05, 0.15, 0, material('#6c6c5b'));
  cylinder(camera, 0.085, 0.085, 0.13, 0, 0, 0.11, material('#292c2a'), 16).rotation.x =
    Math.PI / 2;
  cylinder(
    camera,
    0.055,
    0.055,
    0.14,
    0,
    0,
    0.12,
    material('#6c999d', { metalness: 0.3, roughness: 0.15 }),
    16,
  ).rotation.x = Math.PI / 2;
  interactions.push({ id: 'camera', kind: 'camera', label: '拿起相机', mesh: camera, radius: 2.5 });
  const galleryFrame = picture(group, -3.65, 2.15, -5.79, 2.3, 1.48, 'hero');
  galleryFrame.getObjectByName('frame-art').visible = false;
  const mounted = new THREE.Mesh(
    new THREE.PlaneGeometry(2.06, 1.24),
    new THREE.MeshStandardMaterial({ map: imageTexture('tide'), roughness: 1 }),
  );
  mounted.position.set(0, 0, 0.086);
  mounted.visible = false;
  mounted.name = 'mounted-photo';
  galleryFrame.add(mounted);
  interactions.push({
    id: 'frame',
    kind: 'frame',
    label: '查看墙上的画框',
    mesh: galleryFrame,
    radius: 3,
  });
  sign(group, '留一个位置，给下一段经历。', -3.65, 1.12, -5.8, 2.8, 0.27, {
    background: '#f4f4ec',
    color: '#85999a',
  });
  picture(group, 1.3, 2.27, -5.8, 1.55, 1.94, 'forest', palette.pine);
  picture(group, 3.8, 2.27, -5.8, 1.55, 1.94, 'radio', palette.pine);
  for (let i = 0; i < 2; i++) {
    box(group, 4.6, 0.1, 0.34, 2.55, 3.59 + i * 0.27, -5.45, lightWood);
  }
  bench(group, 2.8, 2.4, Math.PI, '#91afb2');
  bench(group, 5.4, 0.5, -Math.PI / 2, '#d4b5be');
  const roundTable = cylinder(group, 0.6, 0.6, 0.1, 3.9, 0.63, 1.5, material('#e1e7df'), 24);
  cylinder(group, 0.08, 0.14, 0.57, 3.9, 0.31, 1.5, wood, 12);
  cylinder(group, 0.12, 0.09, 0.18, 3.74, 0.77, 1.5, material('#f0dec0'), 16);
  cylinder(group, 0.12, 0.09, 0.18, 4.14, 0.77, 1.44, material('#d39976'), 16);
  box(group, 2, 0.09, 0.55, 4.1, 1.0, -3.9, wood);
  [3.3, 4.9].forEach((x) => box(group, 0.1, 0.95, 0.1, x, 0.48, -3.9, wood));
  const radio = new THREE.Group();
  radio.position.set(4.1, 1.23, -3.9);
  group.add(radio);
  box(radio, 0.77, 0.4, 0.25, 0, 0, 0, material('#aa7450'));
  box(radio, 0.62, 0.29, 0.025, 0, 0, 0.14, material('#dbbf8c'));
  for (let i = 0; i < 8; i++)
    box(radio, 0.025, 0.22, 0.01, -0.23 + i * 0.045, 0, 0.159, material('#6d644d'));
  cylinder(radio, 0.043, 0.043, 0.025, 0.23, 0.07, 0.17, material('#565b49'), 12).rotation.x =
    Math.PI / 2;
  const aerial = box(radio, 0.013, 0.55, 0.013, 0.3, 0.44, 0, material('#6b6b59'));
  aerial.rotation.z = -0.2;
  interactions.push({
    id: 'radio',
    kind: 'radio',
    label: '收听海岸电台',
    mesh: radio,
    radius: 2.7,
  });
  plant(group, -5.7, -4.7, 1.3);
  plant(group, 5.7, -4.7, 1.3, 'long');
  plant(group, -5.8, 5.4, 1.35, 'long');
  plant(group, 5.6, 5.0, 1.1);
  box(group, 1.65, 0.055, 1.65, 0, 0.01, 9.25, material('#dce5df'));
  [-4.7, 4.7].forEach((x) => {
    plant(group, x, 8.1, 1.05);
    lantern(group, x, 2.4, 7.2);
  });
  for (let i = 0; i < 4; i++)
    box(group, 4.2, 0.06, 0.045, 8, 0.06, -9 - i * 1.0, material('#c9d6cf'));
  lighthouse(group, 11, -15.4);
  frameStand(group, 6.2, -7.1, '前往潮汐档案馆');
  const passage = portal(group, 'portal-tide', 9.8, -9.8, '潮汐档案馆');
  interactions.push({
    id: 'portal-tide',
    kind: 'portal',
    label: '进入潮汐档案馆',
    mesh: passage,
    radius: 3.7,
  });
  const forestPassage = portal(group, 'portal-forest', -10.5, -11.4, '雾林邮局', '#b6c58c');
  interactions.push({
    id: 'portal-forest',
    kind: 'portal',
    label: '进入雾林邮局',
    mesh: forestPassage,
    radius: 3.7,
  });
  const pathStone = material('#e1e7df');
  for (let i = 0; i < 9; i++) box(group, 1.2, 0.055, 0.85, -10.5, 0.025, 8 - i * 2.15, pathStone);
  colliders.push({ minX: 9.7, maxX: 12.3, minZ: -16.6, maxZ: -14.1 });
  return {
    door,
    photo,
    camera,
    mounted,
    portals: [passage, forestPassage],
    waypoints: {
      table: [-0.1, 1.9],
      frame: [-3.7, -3.5],
      door: [0.4, 5.5],
      shore: [7.8, -6.5],
      route: [
        [-0.1, 1.9],
        [-3.7, -3.5],
        [0.5, -3.5],
        [4.8, 3.6],
        [7.8, -6.5],
      ],
    },
  };
}
function bookcase(parent, x, z, w = 3.2) {
  const timber = material('#91a7aa');
  box(parent, w, 3.7, 0.65, x, 1.85, z, timber);
  for (let row = 0; row < 5; row++) {
    box(parent, w - 0.16, 0.58, 0.71, x, 0.52 + row * 0.66, z + 0.03, material('#ccd8d0'));
    for (let i = 0; i < 7; i++) {
      const h = 0.3 + ((i * 3 + row) % 4) * 0.07;
      box(
        parent,
        0.25,
        h,
        0.47,
        x - w / 2 + 0.3 + (i * (w - 0.45)) / 7,
        0.31 + row * 0.66 + h / 2,
        z + 0.19,
        material(['#6d8c82', '#baaf8b', '#788b81', '#a28867'][(i + row) % 4]),
      );
    }
  }
}
function makeTide(group, interactions, colliders) {
  enrichGround(group);
  floorTiles(group, 0, -0.5, 14, 15);
  const plaster = material('#eef3f0'),
    wood = material('#91a8ac'),
    light = material('#e0e8df');
  box(group, 15, 0.25, 17, 0, -0.15, -1, material('#cadbd0'));
  box(group, 14, 4.6, 0.3, 0, 2.3, -8, plaster);
  box(group, 0.3, 4.6, 16, -7, 2.3, 0, plaster);
  [-7, -2, 3, 7].forEach((z) => box(group, 0.23, 4.5, 0.23, 7, 2.25, z, wood));
  barrelRoof(group, 0, -0.2, 14.4, 16.8, 4.65, 2.2);
  flowerSpray(group, -5.7, 3.8, 7.7, 3.6);
  flowerSpray(group, 5.7, 3.8, 7.7, 3.6);
  for (let i = 0; i < 10; i++) box(group, 0.15, 0.22, 16, -6.75 + i * 1.5, 4.49, 0, light);
  sign(group, '潮汐档案馆', 0, 4.1, -7.79, 4.5, 0.62, {
    small: '记下潮水尚未带走的事',
    background: '#eef3f0',
  });
  [-4.7, 0, 4.7].forEach((x) => bookcase(group, x, -7.3, 3.5));
  // The coastal library extends into an open reading terrace.
  box(group, 3.9, 0.15, 1.9, -2.3, 0.9, -1.6, material('#c7d6cf'));
  [-3.8, -0.8].forEach((x) =>
    [-2.2, -1].forEach((z) => box(group, 0.12, 0.86, 0.12, x, 0.43, z, wood)),
  );
  colliders.push(
    { minX: -4.3, maxX: -0.25, minZ: -2.6, maxZ: -0.55 },
    { minX: -7.2, maxX: -6.8, minZ: -8, maxZ: 8 },
    { minX: -7, maxX: 7, minZ: -8.2, maxZ: -7.4 },
  );
  for (let i = 0; i < 5; i++) {
    const paper = box(
      group,
      0.66,
      0.014,
      0.78,
      -3.5 + i * 0.56,
      1.0,
      -1.9 + Math.sin(i) * 0.21,
      material(i % 2 ? '#eee5c8' : '#d7d4b7'),
    );
    paper.rotation.y = 0.13 * i;
  }
  const rubbing = new THREE.Group();
  rubbing.position.set(-1.35, 1.025, -1.38);
  rubbing.rotation.x = -Math.PI / 2;
  group.add(rubbing);
  box(rubbing, 1.1, 0.78, 0.016, 0, 0, 0, material('#eee2ba'));
  const ink = new THREE.Mesh(
    new THREE.PlaneGeometry(0.94, 0.6),
    new THREE.MeshStandardMaterial({
      map: imageTexture('tide'),
      color: '#b8bb9e',
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  ink.position.z = 0.012;
  rubbing.add(ink);
  interactions.push({
    id: 'rubbing',
    kind: 'rubbing',
    label: '拾起潮线拓片',
    mesh: rubbing,
    radius: 2.7,
  });
  picture(group, 4.2, 2.6, -7.68, 2.1, 1.15, 'tide', palette.pine);
  bench(group, 4.6, 1.7, 0, '#94b1b5');
  bench(group, 4.6, 4.6, Math.PI, '#94b1b5');
  cylinder(group, 0.65, 0.65, 0.12, 4.6, 0.7, 3.15, material('#d2ded6'), 24);
  cylinder(group, 0.1, 0.2, 0.65, 4.6, 0.33, 3.15, wood);
  plant(group, -5.5, 5, 1.5, 'long');
  plant(group, 5.9, -5.6, 1.7);
  plant(group, -5.5, -5.7, 1.2);
  const entrance = portal(group, 'portal-origin', 0.2, 9.6, '回到群岛会客厅', '#c8d8af');
  interactions.push({
    id: 'portal-origin',
    kind: 'portal',
    label: '带着经历返回群岛',
    mesh: entrance,
    radius: 3.5,
  });
  // Distant marine observatory and buoy line add an independent silhouette.
  const tower = new THREE.Group();
  tower.position.set(10, 0, -14);
  group.add(tower);
  cylinder(tower, 1.45, 1.8, 2.4, 0, 1.2, 0, material('#dae6df'), 12);
  const dome = ball(tower, 1.52, 0, 2.5, 0, material('#a0bbc1'), [1, 0.75, 1]);
  cylinder(tower, 0.12, 0.12, 2.6, 0, 3.5, 0, wood, 9);
  box(tower, 0.08, 0.6, 1.3, 0, 4.4, 0, light);
  for (let i = 0; i < 6; i++)
    ball(group, 0.22, 15 + i * 2.5, 0.07, -7 - i * 1.7, material('#e1b57c'), [1, 0.65, 1]);
  return {
    rubbing,
    portals: [entrance],
    waypoints: {
      table: [-0.1, -0.4],
      frame: [2.2, -5],
      door: [0.4, 5.5],
      shore: [8.4, -3],
      route: [
        [-0.1, -0.4],
        [2.2, -5],
        [5.5, -1.1],
        [0.4, 5.5],
      ],
    },
  };
}
function makeForest(group, interactions, colliders) {
  enrichGround(group, true);
  const wood = material('#a9bdb7'),
    green = material('#87a4a0');
  box(group, 9, 0.2, 9, 0, -0.13, -1, material('#d5e0d5'));
  box(group, 9, 3.9, 0.2, 0, 1.95, -5.5, material('#dce5d8'));
  box(group, 0.2, 3.9, 9, -4.5, 1.95, -1, wood);
  box(group, 0.2, 3.9, 9, 4.5, 1.95, -1, wood);
  barrelRoof(group, 0, -1, 9.5, 9.8, 4.0, 1.7);
  flowerSpray(group, -3.2, 3.5, 3.55, 3.5);
  flowerSpray(group, 3.2, 3.5, 3.55, 3.5);
  sign(group, '雾林邮局', 0, 2.95, -5.34, 3.4, 0.65, {
    small: '给每一封信，一个抵达的地方',
    background: '#dce5d8',
  });
  box(group, 4, 0.16, 1.7, -0.4, 0.95, -1, wood);
  [-2.1, 1.3].forEach((x) =>
    [-1.5, -0.5].forEach((z) => box(group, 0.13, 0.9, 0.13, x, 0.45, z, wood)),
  );
  bookcase(group, -2.8, -5, 2.8);
  bookcase(group, 2.8, -5, 2.8);
  for (let i = 0; i < 5; i++)
    box(
      group,
      0.5,
      0.014,
      0.35,
      -1.7 + i * 0.6,
      1.045,
      -1.1,
      material(['#eee5c7', '#d7bda4', '#c9d1b0'][i % 3]),
    );
  const rubbing = new THREE.Group();
  rubbing.position.set(0.6, 1.05, -0.5);
  rubbing.rotation.x = -Math.PI / 2;
  group.add(rubbing);
  box(rubbing, 0.7, 0.45, 0.025, 0, 0, 0, material('#eeddb7'));
  sign(rubbing, '寄往归处', 0, 0, 0.015, 0.64, 0.38, { background: '#eeddb7' });
  interactions.push({
    id: 'postcard',
    kind: 'postcard',
    label: '拾起林间明信片',
    mesh: rubbing,
    radius: 2.7,
  });
  const entrance = portal(group, 'portal-origin', 0, 7.6, '回到群岛会客厅', '#c8d8af');
  interactions.push({
    id: 'portal-origin',
    kind: 'portal',
    label: '返回群岛会客厅',
    mesh: entrance,
    radius: 3.6,
  });
  colliders.push(
    { minX: -2.5, maxX: 1.7, minZ: -1.9, maxZ: -0.1 },
    { minX: -4.7, maxX: -4.3, minZ: -5.5, maxZ: 3.5 },
    { minX: 4.3, maxX: 4.7, minZ: -5.5, maxZ: 3.5 },
    { minX: -4.5, maxX: 4.5, minZ: -5.7, maxZ: -5.2 },
  );
  for (let i = 0; i < 9; i++)
    tree(group, 8 + (i % 2) * 3, -16 + i * 3.6, 0.9 + (i % 3) * 0.14, true);
  plant(group, -3.6, 2.5, 1.3);
  plant(group, 3.5, 2.5, 1.3, 'long');
  return {
    rubbing,
    portals: [entrance],
    waypoints: {
      table: [-0.1, 1],
      frame: [2, -3.5],
      door: [0.6, 3],
      shore: [6.8, -3],
      route: [
        [-0.1, 1],
        [2, -3.5],
        [-2, -3.5],
        [0.6, 3],
      ],
    },
  };
}

// Static architecture shares a few draw calls while interactive objects retain their own meshes.
function batchArchitecture(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse((object) => {
    if (
      !object.isMesh ||
      object.isInstancedMesh ||
      !object.geometry.getAttribute('normal') ||
      !object.geometry.getAttribute('uv') ||
      Array.isArray(object.material)
    )
      return;
    let ancestor = object;
    while (ancestor) {
      if (ancestor.userData.interactionId) return;
      ancestor = ancestor.parent;
    }
    const mat = object.material;
    if (mat !== sprayMaterial && (!mat.isMeshStandardMaterial || mat.map || mat.transparent))
      return;
    const key =
      mat === sprayMaterial
        ? 'wisteria-spray'
        : [
            mat.color.getHexString(),
            mat.roughness,
            mat.metalness,
            mat.emissive.getHexString(),
            mat.emissiveIntensity,
            object.castShadow,
            object.receiveShadow,
          ].join('/');
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(object);
  });
  const removedMaterials = new Set();
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const source = meshes[0];
    const attributes = { position: [], normal: [], uv: [] };
    const counts = { position: 0, normal: 0, uv: 0 };
    for (const mesh of meshes) {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      for (const name of Object.keys(attributes)) {
        const array = geometry.getAttribute(name).array;
        attributes[name].push(array);
        counts[name] += array.length;
      }
      geometry.dispose();
      mesh.geometry.dispose();
      mesh.removeFromParent();
      removedMaterials.add(mesh.material);
    }
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(attributes)) {
      const joined = new Float32Array(counts[name]);
      let offset = 0;
      for (const part of attributes[name]) {
        joined.set(part, offset);
        offset += part.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(joined, name === 'uv' ? 2 : 3));
    }
    geometry.computeBoundingSphere();
    const merged = new THREE.Mesh(geometry, source.material);
    merged.castShadow = source.castShadow;
    merged.receiveShadow = source.receiveShadow;
    group.add(merged);
  }
  const remainingMaterials = new Set();
  group.traverse((object) => {
    if (object.material) remainingMaterials.add(object.material);
  });
  for (const mat of removedMaterials) if (!remainingMaterials.has(mat)) mat.dispose();
}

export function createEnvironment(worldId = 'origin') {
  const group = new THREE.Group();
  group.name = 'world-' + worldId;
  const interactables = [],
    colliders = [];
  const background = worldId === 'forest' ? '#d4e0da' : worldId === 'tide' ? '#d3e5e7' : '#dce9e9';
  const fog = background;
  pastelSky(group, worldId === 'forest');
  const ambient = new THREE.HemisphereLight('#e0eeff', '#7c957e', 1.35);
  group.add(ambient);
  const sun = new THREE.DirectionalLight('#fff6e7', 2.85);
  sun.position.set(-11, 19, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 23;
  sun.shadow.camera.bottom = -23;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 65;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  group.add(sun);
  group.add(sun.target);
  const sea = water(
    group,
    worldId === 'forest' ? '#639c9f' : worldId === 'tide' ? '#4b92af' : '#5c9fb8',
  );
  clouds(group);
  skyIslands(group, worldId === 'forest' ? '#91aea6' : '#90acb9');
  const updatePetals = driftingPetals(group);
  flowerGarden(group, worldId === 'forest');
  const objects =
    worldId === 'tide'
      ? makeTide(group, interactables, colliders)
      : worldId === 'forest'
        ? makeForest(group, interactables, colliders)
        : makeOrigin(group, interactables, colliders);
  interactables.forEach((item) => {
    item.mesh.userData.interactionId = item.id;
    item.mesh.traverse((child) => {
      child.userData.interactionId = item.id;
    });
  });
  batchArchitecture(group);
  let doorGoal = 0;
  return {
    group,
    background,
    fog,
    preview: { x: 12.5, y: 3.6, z: 18.3, target: [0, 2.0, 1] },
    spawn:
      worldId === 'origin'
        ? { x: 0, y: 1.65, z: 12, yaw: 0, pitch: -0.03 }
        : { x: 0, y: 1.65, z: 7, yaw: 0, pitch: -0.03 },
    bounds: { minX: -14, maxX: 15, minZ: -19, maxZ: 15 },
    colliders,
    interactables,
    waypoints: objects.waypoints,
    update(dt, t) {
      sea.time.value = t;
      updatePetals(dt, t);
      if (objects.door)
        objects.door.rotation.y = THREE.MathUtils.damp(objects.door.rotation.y, doorGoal, 5, dt);
      objects.portals?.forEach((p) => {
        p.userData.veil.material.opacity = 0.23 + Math.sin(t * 0.8) * 0.06;
        p.userData.portalLines.children.forEach((dot, i) => {
          dot.position.y = 0.4 + i * 0.28 + Math.sin(t * 0.8 + i) * 0.09;
        });
      });
    },
    applyState(state) {
      doorGoal = state.doorOpen ? -Math.PI * 0.52 : 0;
      if (objects.photo)
        objects.photo.visible =
          !state.photoMounted && (!state.photoOwner || state.photoOwner === 'table');
      if (objects.camera)
        objects.camera.visible = !state.cameraOwner || state.cameraOwner === 'table';
      if (objects.mounted)
        objects.mounted.visible = Boolean(state.photoMounted || state.exhibitionPhotoId);
      if (objects.rubbing)
        objects.rubbing.visible = worldId === 'forest' ? !state.postcardTaken : !state.rubbingTaken;
    },
    setPhotoTexture(texture) {
      if (objects.mounted) {
        objects.mounted.material.map = texture;
        objects.mounted.material.needsUpdate = true;
      }
    },
  };
}
