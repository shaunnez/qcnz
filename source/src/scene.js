import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import * as G from './geo.js';
import { sunPos } from './weather.js';

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.03+17.; a*=.5; } return s; }
`;
const FOG = `
uniform vec3 uFog; uniform float uFogD; uniform vec2 uHalf;
vec3 applyFog(vec3 c, vec3 w){
  float d=length(w-cameraPosition);
  float f=1.-exp(-pow(d*uFogD,2.));
  vec2 e=abs(w.xz)/uHalf;
  f=max(f, smoothstep(.84,1.,max(e.x,e.y)));
  return mix(c,uFog,f);
}`;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const col = h => new THREE.Color(h);

// Light, sky and weather values for one moment.
export function envFrom(ts, w) {
  const s = sunPos(ts), alt = s.alt * 180 / Math.PI;
  const day = smooth(-7, 5, alt), gold = Math.exp(-Math.pow((alt - 1.5) / 7, 2));
  const c = w.cloud, oc = Math.pow(c, 1.5), rainN = Math.min(1, w.rain / 2.5);
  const zen = col('#070d20').lerp(col('#3a84cc'), day).lerp(col('#34407e'), gold * 0.45);
  const hor = col('#0d1828').lerp(col('#bedbea'), day).lerp(col('#f3a66c'), gold * (1 - c * 0.7) * 0.85);
  const grey = col('#161c26').lerp(col('#aeb8be'), day);
  zen.lerp(grey.clone().multiplyScalar(0.82), oc * 0.92);
  hor.lerp(grey, oc * 0.85);
  zen.multiplyScalar(1 - rainN * 0.28); hor.multiplyScalar(1 - rainN * 0.2);
  const sunUp = smooth(-3, 5, alt);
  const sunCol = col('#ff9a55').lerp(col('#fff0d2'), smooth(0, 24, alt)).multiplyScalar(sunUp * (1 - 0.72 * oc) * 1.05);
  const amb = col('#46578a').lerp(col('#66747f'), day);
  amb.r += c * 0.13 * day; amb.g += c * 0.13 * day; amb.b += c * 0.13 * day;
  let az = s.az, a2 = s.alt;
  const night = 1 - day;
  if (alt < -3) { // moonlight keeps the relief readable at night
    az = s.az + Math.PI; a2 = 0.7;
    sunCol.set('#6f86c4').multiplyScalar(0.8 * (1 - 0.5 * oc));
  }
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(a2), Math.sin(a2), -Math.cos(az) * Math.cos(a2)).normalize();
  const realSun = new THREE.Vector3(Math.sin(s.az) * Math.cos(s.alt), Math.sin(s.alt), -Math.cos(s.az) * Math.cos(s.alt));
  const to = (w.dir + 180) * Math.PI / 180;
  const fogCode = (w.code === 45 || w.code === 48) ? 0.003 : 0;
  return {
    sunDir, realSun, sunCol, amb, fog: hor, sky: zen, night, day, cloud: c, rain: rainN,
    fogD: 0.0010 + 0.0004 * c + 0.0009 * rainN + fogCode,
    wind: new THREE.Vector2(Math.sin(to), -Math.cos(to)), windS: Math.min(1, w.wind / 45), sunVis: sunUp * (1 - 0.85 * oc)
  };
}

export function createScene(canvas, labelRoot) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 6000);
  const half = new THREE.Vector2(G.WORLD_W / 2, G.WORLD_D / 2);
  const U = { // shared uniforms
    uSun: { value: new THREE.Vector3(0.3, 0.8, -0.4) }, uSunCol: { value: col('#fff0d2') }, uAmb: { value: col('#66747f') },
    uFog: { value: col('#bedbea') }, uFogD: { value: 0.0012 }, uHalf: { value: half }, uSky: { value: col('#3a84cc') },
    uCloud: { value: 0.2 }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) }, uWindS: { value: 0.3 },
    uWet: { value: 0 }, uNight: { value: 0 }, uRealSun: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: 1 },
    uHt: { value: null }, uHasHt: { value: 0 }, uHtPx: { value: new THREE.Vector2(1 / 2048, 1 / 1608) }, uTopo: { value: null }, uTopoMix: { value: 0 }, uContour: { value: 0 }, uVex: { value: G.VEX / 100 }
  };

  // ---- terrain
  const n = G.GW * G.GH, pos = new Float32Array(n * 3), aH = new Float32Array(n);
  for (let j = 0; j < G.GH; j++) for (let i = 0; i < G.GW; i++) {
    const k = j * G.GW + i, h = G.H[k];
    pos[k * 3] = G.cellX(i); pos[k * 3 + 1] = G.yOf(h); pos[k * 3 + 2] = G.cellZ(j); aH[k] = h;
  }
  const idx = new Uint32Array((G.GW - 1) * (G.GH - 1) * 6);
  let q = 0;
  for (let j = 0; j < G.GH - 1; j++) for (let i = 0; i < G.GW - 1; i++) {
    const a = j * G.GW + i, b = a + 1, c = a + G.GW, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  tg.setIndex(new THREE.BufferAttribute(idx, 1));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `attribute float aH; varying vec3 vW; varying vec3 vN; varying float vH;
      void main(){ vH=aH; vN=normal; vW=position; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float;
      uniform vec3 uSun, uSunCol, uAmb; uniform float uCloud, uTime, uWet, uNight, uHasHt, uTopoMix, uContour, uVex; uniform vec2 uWind, uHtPx;
      uniform sampler2D uHt, uTopo;
      varying vec3 vW; varying vec3 vN; varying float vH;
      ${NOISE}${FOG}
      float hAt(vec2 uv){ vec4 t=texture2D(uHt,uv); return (t.r*65280.+t.g*255.)/50.; }
      float cline(float h, float st, float lim){ float f=h/st, w=fwidth(f); float d=abs(fract(f-.5)-.5)/max(w,1e-5); return (1.-smoothstep(.7,1.7,d))*(1.-smoothstep(lim*.5,lim,w)); }
      void main(){
        vec3 n=normalize(vN); vec3 c; float h=vH;
        vec2 uv=vW.xz/(2.*uHalf)+.5;
        bool wet=vH<0.;
        if(uHasHt>.5){ float hc=hAt(uv); wet=hc<.3 && vH<14.; if(!wet) h=hc>=.3?hc:max(vH,.6); }
        if(uHasHt>.5 && !wet){
          // height and slope from the LINZ height image, about 20 m for each pixel
          h=hAt(uv);
          float hx=hAt(uv+vec2(uHtPx.x,0.))-hAt(uv-vec2(uHtPx.x,0.)), hz=hAt(uv+vec2(0.,uHtPx.y))-hAt(uv-vec2(0.,uHtPx.y));
          vec3 nd=normalize(vec3(-hx*uVex/(4.*uHalf.x*uHtPx.x), 1., -hz*uVex/(4.*uHalf.y*uHtPx.y)));
          float far=smoothstep(60.,420.,length(vW-cameraPosition));
          n=normalize(mix(nd,n,far*.55));
        }
        float slope=1.-n.y;
        float t=fbm(vW.xz*.42), t2=noise(vW.xz*2.6);
        if(wet){
          float d=clamp(-vH/70.,0.,1.);
          c=mix(vec3(.38,.80,.72), vec3(.02,.19,.27), smoothstep(0.,1.,sqrt(d)));
          if(vH>=0.) c=vec3(.13,.40,.45); // water pixel on a mesh cell that is above the water plane
        } else {
          vec3 bush=mix(vec3(.09,.27,.17), vec3(.25,.50,.25), t*.75+t2*.25);
          bush=mix(bush, vec3(.13,.30,.24), smoothstep(.25,.6,n.z*.5+.5)*.35);
          if(uHasHt>.5){
            // land cover from the topo data: open land, scrub, forest
            float cov=texture2D(uHt,uv).b;
            vec3 open=mix(vec3(.50,.58,.28), vec3(.66,.67,.36), t*.6+t2*.4);
            vec3 scrub=mix(vec3(.24,.38,.20), vec3(.40,.50,.27), t2);
            bush=mix(mix(open,scrub,smoothstep(.06,.42,cov)), bush, smoothstep(.56,.94,cov));
          }
          c=mix(bush, vec3(.44,.47,.27), smoothstep(620.,980.,h+t*180.));
          c=mix(c, vec3(.46,.43,.37), smoothstep(.5,.78,slope+t*.12));
          c=mix(vec3(.88,.81,.62), c, smoothstep(1.2,7.,h+t*4.));
          if(uContour>.5){
            float cl=max(cline(h,20.,.3)*.34, cline(h,100.,.5)*.62)*step(2.,h);
            c=mix(c, vec3(.96,.90,.70), cl);
          }
        }
        float cs=fbm(vW.xz*.011+uWind*uTime*.03);
        float shade=1.-uCloud*.6*smoothstep(.40,.62,cs);
        float dif=max(dot(n,uSun),0.)*shade;
        float rim=pow(max(dot(n,uSun)*.5+.5,0.),2.)*.25;
        vec3 light=uAmb*(1.55+rim)+uSunCol*dif*1.05;
        vec3 lit=c*light;
        lit*=1.-uWet*.16;
        if(uTopoMix>0.){
          // the printed map: keep it readable, with soft relief shade
          vec3 tp=texture2D(uTopo,uv).rgb;
          float L=clamp(dot(light,vec3(.34)),.3,1.2);
          lit=mix(lit, tp*mix(1.,L,.5), uTopoMix);
        }
        gl_FragColor=vec4(applyFog(lit,vW),1.);
      }`
  }));
  terrain.material.extensions = { derivatives: true };
  terrain.frustumCulled = false;
  scene.add(terrain);

  // ---- water
  const wg = new THREE.PlaneGeometry(G.WORLD_W, G.WORLD_D, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision highp float;
      uniform vec3 uSun, uSunCol, uAmb, uSky, uRealSun; uniform float uTime, uWindS, uCloud, uSunVis, uTopoMix, uHasHt; uniform vec2 uWind; uniform sampler2D uHt;
      varying vec3 vW;
      ${NOISE}${FOG}
      float wave(vec2 p){ return noise(p*1.5+uWind*uTime*.55)+.5*noise(p*3.7-uWind.yx*uTime*.4+9.)+.25*noise(p*8.+uWind*uTime*.9); }
      void main(){
        vec2 p=vW.xz; float lod=clamp(55./length(cameraPosition-vW),.06,1.); float e=.22, amp=(.05+.16*uWindS)*lod;
        float h0=wave(p), hx=wave(p+vec2(e,0.)), hz=wave(p+vec2(0.,e));
        vec3 n=normalize(vec3(-(hx-h0)/e*amp,1.,-(hz-h0)/e*amp));
        vec3 V=normalize(cameraPosition-vW);
        float fres=pow(1.-max(dot(n,V),0.),3.);
        vec3 deep=vec3(.02,.21,.28)*(uAmb*1.6+uSunCol*.5*max(uSun.y,0.));
        vec3 c=mix(deep, uSky*1.05, .18+.72*fres);
        float spec=pow(max(dot(reflect(-uRealSun,n),V),0.),70.)*uSunVis;
        c+=vec3(1.,.93,.8)*spec*(.5+.9*lod);
        c+=uSunCol*pow(max(dot(reflect(-uSun,n),V),0.),14.)*.10;
        float al=mix(.50,.93,fres)*(1.-.9*uTopoMix);
        if(uHasHt>.5){ vec4 th=texture2D(uHt,vW.xz/(2.*uHalf)+.5); al*=1.-smoothstep(.2,.7,(th.r*65280.+th.g*255.)/50.); }
        gl_FragColor=vec4(applyFog(c,vW), al);
      }`
  }));
  water.renderOrder = 1; scene.add(water);

  // ---- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.); }`,
    fragmentShader: `precision highp float; uniform vec3 uFog, uSky, uRealSun; uniform float uSunVis; varying vec3 vD;
      void main(){ vec3 d=normalize(vD); vec3 c=mix(uFog,uSky,smoothstep(0.,.55,d.y));
        float s=max(dot(d,normalize(uRealSun)),0.);
        c+=vec3(1.,.9,.7)*(pow(s,900.)*2.+pow(s,24.)*.22)*uSunVis;
        gl_FragColor=vec4(c,1.); }`
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // ---- stars
  const sp = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(th) * r * 2600; sp[i * 3 + 1] = y * 2600; sp[i * 3 + 2] = Math.sin(th) * r * 2600;
  }
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
  stars.renderOrder = -9; stars.frustumCulled = false; scene.add(stars);

  // ---- soft sprite textures
  function blobTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const glowTex = blobTex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  const cloudTex = blobTex(256, (x, s) => {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * s * 0.22, cx = s / 2 + Math.cos(a) * r * 1.5, cy = s / 2 + Math.sin(a) * r * 0.8, rr = s * (0.14 + Math.random() * 0.14);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
  });

  // ---- clouds
  const clouds = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0, fog: false });
    const s = new THREE.Sprite(m), sc = 70 + Math.random() * 90;
    s.scale.set(sc, sc * 0.55, 1);
    s.position.set((Math.random() - 0.5) * G.WORLD_W * 1.1, 19 + Math.random() * 12, (Math.random() - 0.5) * G.WORLD_D * 1.1);
    s.renderOrder = 5; s.userData.rank = (i * 7) % 30; scene.add(s); clouds.push(s);
  }

  // ---- rain
  const RN = 1300, rb = new Float32Array(RN * 6), re = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) {
    const x = Math.random() * 120, y = Math.random() * 60, z = Math.random() * 120;
    rb.set([x, y, z, x, y, z], i * 6); re[i * 2] = 0; re[i * 2 + 1] = 1;
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rb, 3));
  rgeo.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  const rainU = { uTime: U.uTime, uWind: U.uWind, uCenter: { value: new THREE.Vector3() }, uScale: { value: 1 }, uAlpha: { value: 0 } };
  const rain = new THREE.LineSegments(rgeo, new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false,
    vertexShader: `attribute float aEnd; uniform float uTime, uScale; uniform vec3 uCenter; uniform vec2 uWind;
      void main(){ float sp=50.*(.8+.4*fract(position.x*7.31)); vec3 p=position;
        p.y=mod(position.y-uTime*sp,60.); p.xz=mod(position.xz+uWind*uTime*10.,120.)-60.;
        p.y+=aEnd*2.4; p.xz-=uWind*aEnd*.8;
        gl_Position=projectionMatrix*viewMatrix*vec4(uCenter+p*uScale,1.); }`,
    fragmentShader: `precision mediump float; uniform float uAlpha; void main(){ gl_FragColor=vec4(.82,.9,.97,uAlpha); }`
  }));
  rain.frustumCulled = false; rain.renderOrder = 6; rain.visible = false; scene.add(rain);

  // ---- controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.screenSpacePanning = false;
  controls.minDistance = 7; controls.maxDistance = 620; controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.43;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.zoomSpeed = 1.1; controls.rotateSpeed = 0.7;
  let lastTouch = -1e9, fly = null, idleOrbit = true;
  canvas.addEventListener('pointerdown', () => { lastTouch = performance.now(); fly = null; idleOrbit = false; controls.enabled = true; });
  canvas.addEventListener('wheel', () => { lastTouch = performance.now(); fly = null; idleOrbit = false; }, { passive: true });

  function setSpherical(target, r, theta, phi) {
    const sphi = Math.sin(phi);
    camera.position.set(target.x + r * sphi * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * sphi * Math.cos(theta));
    controls.target.copy(target); camera.lookAt(target);
  }
  function getSpherical() {
    const o = camera.position.clone().sub(controls.target), r = o.length();
    return { r, theta: Math.atan2(o.x, o.z), phi: Math.acos(Math.max(-1, Math.min(1, o.y / r))) };
  }
  // ---- touch gestures, as in a phone map app. One finger moves the map. Pinch zooms about the fingers.
  // Twist turns the map. Two fingers up or down tilt. Double tap zooms in. Two-finger tap zooms out.
  controls.touches = { ONE: -1, TWO: -1 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tp = new Map();
  const gPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), gHit = new THREE.Vector3();
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v)), wrapA = a => ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  function groundAt(cx, cy) { // the ground point below a screen point, or null near the horizon
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, 1 - (cy - r.top) / r.height * 2);
    camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    gPlane.constant = -controls.target.y;
    if (!ray.ray.intersectPlane(gPlane, gHit)) return null;
    if (gHit.distanceTo(camera.position) > camera.position.distanceTo(controls.target) * 5) return null;
    return gHit.clone();
  }
  function shiftView(dx, dz) { controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz; }
  function zoomAbout(cx, cy, ratio, dAng) { // keep the ground point below (cx, cy) in its place on the screen
    const A = groundAt(cx, cy), s = getSpherical();
    setSpherical(controls.target, clampN(s.r * ratio, controls.minDistance, controls.maxDistance), s.theta + (dAng || 0), s.phi);
    const B = A && groundAt(cx, cy);
    if (A && B) shiftView(A.x - B.x, A.z - B.z);
  }
  let gs = null, vel = null, zoomAnim = null, lastTap = { t: 0, x: 0, y: 0 };
  const two = () => { const [a, b] = [...tp.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), ang: Math.atan2(b.y - a.y, b.x - a.x), ay: a.y, by: b.y }; };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    tp.set(e.pointerId, { x: e.clientX, y: e.clientY }); vel = null; zoomAnim = null;
    const now = e.timeStamp;
    if (tp.size === 1) gs = { n: 1, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now, moved: false, hist: [] };
    else if (tp.size === 2) { const s = two(); gs = { n: 2, ...s, d0: s.d, ang0: s.ang, cx0: s.cx, ay0: s.ay, by0: s.by, mode: '', rot: false, rotAcc: 0, t0: now }; }
    else gs = null;
  });
  canvas.addEventListener('pointermove', e => {
    const p = tp.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!gs) return;
    lastTouch = performance.now();
    if (gs.n === 1 && tp.size === 1) {
      if (!gs.moved) { if (Math.hypot(p.x - gs.x0, p.y - gs.y0) < 6) return; gs.moved = true; }
      const a = groundAt(gs.x, gs.y), b = groundAt(p.x, p.y), s = getSpherical();
      let dx, dz;
      if (a && b) { dx = a.x - b.x; dz = a.z - b.z; }
      else { // near the horizon: move in proportion to the finger
        const k = 2 * s.r * Math.tan(camera.fov * Math.PI / 360) / viewH, mx = -(p.x - gs.x) * k, mf = (p.y - gs.y) * k / Math.max(0.3, Math.cos(s.phi));
        dx = mx * Math.cos(s.theta) - mf * Math.sin(s.theta); dz = -mx * Math.sin(s.theta) - mf * Math.cos(s.theta);
      }
      const m = Math.hypot(dx, dz), lim = s.r * 0.6; if (m > lim) { dx *= lim / m; dz *= lim / m; }
      shiftView(dx, dz);
      const now = e.timeStamp; gs.hist.push({ t: now, dx, dz }); while (gs.hist.length && now - gs.hist[0].t > 110) gs.hist.shift();
      gs.x = p.x; gs.y = p.y;
    } else if (gs.n === 2 && tp.size === 2) {
      const s = two();
      if (!gs.mode) {
        const dyA = s.ay - gs.ay0, dyB = s.by - gs.by0, dd = Math.abs(s.d - gs.d0), da = Math.abs(wrapA(s.ang - gs.ang0));
        if (Math.abs(dyA) > 12 && Math.abs(dyB) > 12 && dyA * dyB > 0 && dd < Math.max(16, gs.d0 * 0.12) && da < 0.14 && Math.abs(s.cx - gs.cx0) < 22) gs.mode = 'tilt';
        else if (dd > 12 || da > 0.14 || Math.abs(s.cx - gs.cx0) > 16) gs.mode = 'pz';
        if (!gs.mode) return;
      }
      if (gs.mode === 'tilt') {
        const q = getSpherical();
        setSpherical(controls.target, q.r, q.theta, clampN(q.phi - (s.cy - gs.cy) * 0.0045, controls.minPolarAngle, controls.maxPolarAngle));
      } else {
        let dAng = wrapA(s.ang - gs.ang);
        if (!gs.rot) { gs.rotAcc += dAng; dAng = 0; if (Math.abs(gs.rotAcc) > 0.16) gs.rot = true; } // a small twist during a pinch does not turn the map
        const A = groundAt(gs.cx, gs.cy), q = getSpherical();
        setSpherical(controls.target, clampN(q.r * gs.d / s.d, controls.minDistance, controls.maxDistance), q.theta + dAng, q.phi);
        const B = A && groundAt(s.cx, s.cy);
        if (A && B) { let dx = A.x - B.x, dz = A.z - B.z; const m = Math.hypot(dx, dz), lim = q.r * 0.6; if (m > lim) { dx *= lim / m; dz *= lim / m; } shiftView(dx, dz); }
      }
      gs.cx = s.cx; gs.cy = s.cy; gs.d = s.d; gs.ang = s.ang;
    }
  });
  const touchUp = e => {
    if (!tp.delete(e.pointerId)) return;
    const now = e.timeStamp;
    if (gs && gs.n === 1) {
      if (gs.moved && gs.hist.length > 1 && now - gs.hist[gs.hist.length - 1].t < 60) {
        const dt = Math.max(0.03, (gs.hist[gs.hist.length - 1].t - gs.hist[0].t) / 1000); let vx = 0, vz = 0;
        for (const h of gs.hist.slice(1)) { vx += h.dx; vz += h.dz; }
        vel = { x: vx / dt, z: vz / dt };
      } else if (!gs.moved && e.type === 'pointerup' && now - gs.t0 < 300) {
        if (now - lastTap.t < 330 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 44) { zoomAnim = { cx: e.clientX, cy: e.clientY, k: Math.log(0.5), u: 0 }; lastTap.t = 0; }
        else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      gs = null;
    } else if (gs && gs.n === 2) {
      if (!gs.mode && e.type === 'pointerup' && now - gs.t0 < 300) zoomAnim = { cx: gs.cx, cy: gs.cy, k: Math.log(2), u: 0 };
      // one finger stays down: it continues to move the map
      if (tp.size === 1) { const [q] = [...tp.values()]; gs = { n: 1, x: q.x, y: q.y, x0: q.x, y0: q.y, t0: -1e9, moved: true, hist: [] }; } else gs = null;
    } else if (tp.size === 0) gs = null;
  };
  canvas.addEventListener('pointerup', touchUp); canvas.addEventListener('pointercancel', touchUp); canvas.addEventListener('lostpointercapture', touchUp);
  function gestureTick(dt) {
    if (vel) {
      shiftView(vel.x * dt, vel.z * dt); const k = Math.exp(-dt * 4.2); vel.x *= k; vel.z *= k;
      if (Math.hypot(vel.x, vel.z) < getSpherical().r * 0.02) vel = null;
    }
    if (zoomAnim) {
      const u = Math.min(1, zoomAnim.u + dt / 0.28), e0 = 1 - Math.pow(1 - zoomAnim.u, 3), e1 = 1 - Math.pow(1 - u, 3);
      zoomAbout(zoomAnim.cx, zoomAnim.cy, Math.exp(zoomAnim.k * (e1 - e0))); zoomAnim.u = u;
      if (u >= 1) zoomAnim = null;
    }
  }

  const angLerp = (a, b, t) => a + ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * t;
  function flyTo(o) {
    const s = getSpherical();
    fly = {
      t: 0, dur: o.dur || 1500, a: { target: controls.target.clone(), ...s },
      b: { target: new THREE.Vector3(o.x, o.y ?? G.groundY(o.x, o.z), o.z), r: o.dist ?? s.r, theta: o.az ?? s.theta, phi: o.polar ?? s.phi }
    };
    idleOrbit = false; vel = null; zoomAnim = null;
    if (o.dur === 0) { setSpherical(fly.b.target, fly.b.r, fly.b.theta, fly.b.phi); controls.update(); fly = null; }
  }
  // Put a set of points in view. The first point is at the bottom of the screen.
  function frame(pts, o = {}) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
    const a = pts[0], b = pts[pts.length - 1];
    let hx = b.x - a.x, hz = b.z - a.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    let along = 0, across = 0; const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
    for (const p of pts) { const dx = p.x - cx, dz = p.z - cz; along = Math.max(along, Math.abs(dx * hx + dz * hz)); across = Math.max(across, Math.abs(-dx * hz + dz * hx)); }
    const tv = Math.tan(camera.fov * Math.PI / 360), polar = o.polar ?? 0.82;
    const dist = Math.max((along * Math.cos(polar) + 3) / (tv * visH / viewH), (across + 3) / (tv * viewW / viewH)) * 1.12;
    flyTo({ x: cx, z: cz, dist: Math.max(dist, 22), az: o.north ? 0 : Math.atan2(-hx, -hz), polar, dur: o.dur });
  }

  // ---- routes
  let lines = [], viewW = 300, viewH = 300, visH = 300, sheetPx = 0, topPx = 0;
  function makeLine(pts, color, width, opts = {}) {
    const flat = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) { flat[i * 3] = pts[i].x; flat[i * 3 + 1] = pts[i].y; flat[i * 3 + 2] = pts[i].z; }
    const g = new LineGeometry(); g.setPositions(flat);
    const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity: opts.opacity ?? 1, depthTest: opts.depthTest ?? true, depthWrite: false, dashed: !!opts.dashed, dashSize: 0.9, gapSize: 0.7 });
    m.resolution.set(viewW, viewH);
    const l = new Line2(g, m); if (opts.dashed) l.computeLineDistances();
    l.renderOrder = opts.order ?? 3; l.frustumCulled = false; scene.add(l); return l;
  }
  function disposeLines(arr) { for (const l of arr) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); } }
  function setRoutes(segs) {
    disposeLines(lines); lines = [];
    for (const s of segs) {
      if (s.pts.length < 2) continue;
      lines.push(makeLine(s.pts, s.color, s.side ? 6 : 9, { opacity: s.dim ? 0.10 : 0.22, depthTest: false, order: 2 }));
      lines.push(makeLine(s.pts, s.color, s.side ? 2.2 : 3.6, { opacity: s.dim ? 0.55 : 1, dashed: s.side, order: 3 }));
    }
  }
  let walked = [];
  function setWalked(list) {
    disposeLines(walked); walked = [];
    for (const pts of list || []) if (pts.length > 1) walked.push(makeLine(pts, '#ffffff', 2, { depthTest: false, order: 4, opacity: 0.95 }));
  }

  // ---- map layers: height image, contours, Topo50 skin
  const loader = new THREE.TextureLoader();
  let topoWanted = false, topoState = 'none', topoTarget = 0;
  function loadHeights() {
    loader.load('heights.png', t => {
      t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      U.uHtPx.value.set(1 / t.image.width, 1 / t.image.height); U.uHt.value = t; U.uHasHt.value = 1;
    }, undefined, () => { /* the map then uses the mesh heights */ });
  }
  function setLayers(o, cb) {
    U.uContour.value = o.contours ? 1 : 0;
    topoWanted = !!o.topo;
    if (!topoWanted) { topoTarget = 0; return; }
    if (topoState === 'ready') { topoTarget = 1; return; }
    if (topoState === 'loading') return;
    topoState = 'loading'; if (cb) cb('loading');
    loader.load('topo.webp', t => {
      t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      U.uTopo.value = t; topoState = 'ready'; if (topoWanted) topoTarget = 1; if (cb) cb('ready');
    }, undefined, () => { topoState = 'none'; if (cb) cb('error'); });
  }
  // ---- topo feature lines: streams, roads, other tracks
  let featLines = [];
  function setFeatureLines(sets) {
    for (const l of featLines) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); }
    featLines = [];
    for (const st of sets || []) {
      if (!st.seg.length) continue;
      const geo = new LineSegmentsGeometry(); geo.setPositions(st.seg);
      const m = new LineMaterial({ color: new THREE.Color(st.color).getHex(), linewidth: st.width, transparent: true, opacity: st.opacity ?? 0.9, depthWrite: false, dashed: !!st.dashed, dashSize: 0.5, gapSize: 0.35 });
      m.resolution.set(viewW, viewH);
      const l = new LineSegments2(geo, m); if (st.dashed) l.computeLineDistances();
      l.renderOrder = 2; l.frustumCulled = false; scene.add(l); featLines.push(l);
    }
  }
  function showFeatureLines(v) { for (const l of featLines) l.visible = v; }
  let peerTrails = [];
  function setPeerTrails(list) {
    disposeLines(peerTrails); peerTrails = [];
    for (const pts of list || []) if (pts.length > 1) peerTrails.push(makeLine(pts, '#58d6c3', 2.4, { depthTest: false, order: 4, opacity: 0.9 }));
  }
  // ---- lights at lodges, walker beacon, ghost
  const lodgeLights = [];
  function addLodgeLight(p) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb454, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    s.position.set(p.x, p.y + 0.5, p.z); s.scale.setScalar(5); s.renderOrder = 7; scene.add(s); lodgeLights.push(s);
  }
  function clearLodgeLights() { for (const s of lodgeLights) { scene.remove(s); s.material.dispose(); } lodgeLights.length = 0; }
  const walker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 16, 10, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vY; void main(){ vY=position.y/16.+.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `precision mediump float; varying float vY; void main(){ gl_FragColor=vec4(1.,.82,.5,pow(1.-vY,1.6)*.9); }`
  }));
  beam.position.y = 8; walker.add(beam);
  const wglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  wglow.scale.setScalar(4.5); wglow.position.y = 0.4; walker.add(wglow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; walker.add(ring);
  walker.visible = false; walker.renderOrder = 8; scene.add(walker);
  const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ff3e6, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  ghost.visible = false; ghost.renderOrder = 8; scene.add(ghost);
  function setWalker(p) { if (!p) { walker.visible = false; return; } walker.visible = true; walker.position.set(p.x, p.y, p.z); }
  function setGhost(p) { if (!p) { ghost.visible = false; return; } ghost.visible = true; ghost.position.set(p.x, p.y + 0.5, p.z); }

  // ---- DOM markers
  const markers = [];
  function addMarker(m) { // {el, x, y, z, pri, near, far, group}
    m.el.style.display = 'none'; labelRoot.appendChild(m.el); markers.push(m); return m;
  }
  function clearMarkers(group) {
    for (let i = markers.length - 1; i >= 0; i--) if (markers[i].group === group) { markers[i].el.remove(); markers.splice(i, 1); }
  }
  const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
  function occluded(m) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let t = 0.12; t < 0.97; t += 0.085) {
      const x = cx + (m.x - cx) * t, y = cy + (m.y - cy) * t, z = cz + (m.z - cz) * t;
      if (G.groundY(x, z) > y + 0.6) return true;
    }
    return false;
  }
  let frameNo = 0;
  function updateMarkers() {
    frameNo++;
    const full = frameNo % 8 === 0, boxes = [];
    if (full) markers.sort((a, b) => b.pri - a.pri);
    for (const m of markers) {
      v3.set(m.x, m.y, m.z);
      const d = v3.distanceTo(camera.position);
      v3.project(camera);
      const sx = (v3.x * 0.5 + 0.5) * viewW, sy = (-v3.y * 0.5 + 0.5) * viewH;
      let vis = v3.z < 1 && sx > -60 && sx < viewW + 60 && sy > topPx + 14 && sy < viewH - sheetPx + 24 && d < (m.far ?? 1e9) && d > (m.near ?? 0);
      if (full) {
        m.occ = vis && !m.noOcc ? occluded(m) : false;
        if (vis && !m.occ && m.w) { // keep labels apart
          const w = m.w, h = m.h || 20, x0 = sx - w / 2, y0 = sy - h;
          m.hit = boxes.some(b => x0 < b[2] && x0 + w > b[0] && y0 < b[3] && y0 + h > b[1]);
          if (!m.hit || m.force) boxes.push([x0, y0, x0 + w, y0 + h]);
        } else m.hit = false;
      }
      if (m.occ || (m.hit && !m.force)) vis = false;
      if (vis) {
        if (!m.shown) { m.el.style.display = ''; m.shown = true; }
        m.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
        if (m.el.dataset.z !== undefined) m.el.classList.toggle('close', d < 95);
      } else if (m.shown) { m.el.style.display = 'none'; m.shown = false; }
    }
  }

  // ---- environment
  let env = null;
  function setEnv(e) {
    env = e;
    U.uSun.value.copy(e.sunDir); U.uRealSun.value.copy(e.realSun); U.uSunCol.value.copy(e.sunCol); U.uAmb.value.copy(e.amb);
    U.uFog.value.copy(e.fog); U.uSky.value.copy(e.sky); U.uFogD.value = e.fogD; U.uCloud.value = e.cloud;
    U.uWind.value.copy(e.wind); U.uWindS.value = e.windS; U.uWet.value = e.rain; U.uNight.value = e.night; U.uSunVis.value = e.sunVis;
    stars.material.opacity = e.night * (1 - e.cloud) * 0.9;
    rain.visible = e.rain > 0.02; rainU.uAlpha.value = 0.10 + 0.3 * e.rain;
    renderer.setClearColor(e.fog, 1);
    const cc = col('#ffffff').lerp(col('#7c858e'), Math.min(1, e.rain * 0.8 + e.cloud * 0.25)).multiplyScalar(0.25 + 0.75 * e.day);
    for (const s of clouds) s.material.color.copy(cc);
    for (const s of lodgeLights) s.material.opacity = 0.28 + 0.7 * e.night;
  }

  function setSize(w, h, sheet, top) {
    viewW = w; viewH = h; sheetPx = sheet; topPx = top; visH = Math.max(120, h - sheet - top);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, 0, (sheet - top) / 2, w, h);
    camera.updateProjectionMatrix();
    for (const l of lines.concat(walked, peerTrails, featLines)) l.material.resolution.set(w, h);
  }

  let chaseState = null;
  function chase(p, hx, hz, dt) {
    // Follow a point. Turn the camera to look along the walk direction, unless the user moved the view.
    const t = controls.target, k = 1 - Math.exp(-dt * 4);
    const dx = (p.x - t.x) * k, dy = (p.y - t.y) * k, dz = (p.z - t.z) * k;
    t.x += dx; t.y += dy; t.z += dz; camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
    if (performance.now() - lastTouch > 3500) {
      const s = getSpherical(), k2 = 1 - Math.exp(-dt * 0.9);
      const theta = (hx || hz) ? angLerp(s.theta, Math.atan2(-hx, -hz), k2) : s.theta;
      setSpherical(t, s.r + (46 - s.r) * k2, theta, s.phi + (1.06 - s.phi) * k2);
    }
    chaseState = true;
  }

  function tick(now, dt) {
    U.uTime.value = now / 1000;
    if (U.uTopoMix.value !== topoTarget) { const d = topoTarget - U.uTopoMix.value; U.uTopoMix.value = Math.abs(d) < 0.02 ? topoTarget : U.uTopoMix.value + d * Math.min(1, dt * 5); }
    if (fly) {
      fly.t += dt * 1000;
      const u = Math.min(1, fly.t / fly.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const a = fly.a, b = fly.b;
      setSpherical(a.target.clone().lerp(b.target, e), Math.exp(Math.log(a.r) + (Math.log(b.r) - Math.log(a.r)) * e), angLerp(a.theta, b.theta, e), a.phi + (b.phi - a.phi) * e);
      if (u >= 1) fly = null;
    } else if (idleOrbit) {
      const s = getSpherical(); setSpherical(controls.target, s.r, s.theta + dt * 0.02, s.phi);
    } else gestureTick(dt);
    controls.update();
    // keep the target on the ground and inside the map, and the camera above the ground
    const t = controls.target;
    t.x = Math.max(-half.x, Math.min(half.x, t.x)); t.z = Math.max(-half.y, Math.min(half.y, t.z));
    if (!fly && !chaseState) { const gy = G.groundY(t.x, t.z), dy = (gy - t.y) * 0.12; t.y += dy; camera.position.y += dy; }
    chaseState = null;
    const cg = G.groundY(camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < cg) camera.position.y = cg;
    const dist = camera.position.distanceTo(t);
    // clouds drift with the wind and fade when you look straight down
    if (env) {
      camera.getWorldDirection(camDir);
      const down = smooth(0.35, 0.8, -camDir.y), base = 0.34 * (1 - 0.85 * down);
      for (const s of clouds) {
        s.position.x += env.wind.x * dt * (0.6 + env.windS * 3); s.position.z += env.wind.y * dt * (0.6 + env.windS * 3);
        if (s.position.x > half.x * 1.15) s.position.x -= half.x * 2.3; if (s.position.x < -half.x * 1.15) s.position.x += half.x * 2.3;
        if (s.position.z > half.y * 1.15) s.position.z -= half.y * 2.3; if (s.position.z < -half.y * 1.15) s.position.z += half.y * 2.3;
        s.material.opacity = Math.max(0, Math.min(1, (env.cloud * 34 - s.userData.rank) / 4)) * base;
      }
      rainU.uCenter.value.set(t.x, Math.max(0, t.y - 4), t.z); rainU.uScale.value = Math.max(0.25, Math.min(5, dist / 75));
    }
    if (walker.visible) {
      const s = Math.max(0.35, Math.min(6, camera.position.distanceTo(walker.position) / 70));
      walker.scale.setScalar(s);
      const ph = (now / 1600) % 1; ring.scale.setScalar(1 + ph * 2.2); ring.material.opacity = 0.8 * (1 - ph);
    }
    if (ghost.visible) ghost.scale.setScalar(Math.max(1.2, camera.position.distanceTo(ghost.position) / 22));
    const pulse = 1 + 0.08 * Math.sin(now / 700);
    for (const s of lodgeLights) s.scale.setScalar(Math.max(2.5, Math.min(26, camera.position.distanceTo(s.position) / 16)) * pulse);
    renderer.render(scene, camera);
    updateMarkers();
  }

  setSpherical(new THREE.Vector3(0, 0, 0), 520, 0.5, 0.75);
  return {
    camera, controls, tick, setEnv, setSize, flyTo, frame, setRoutes, setWalked, setPeerTrails, setWalker, setGhost, addMarker, clearMarkers,
    addLodgeLight, clearLodgeLights, chase, getSpherical, setLayers, loadHeights, setFeatureLines, showFeatureLines,
    groundAt,
    resetNorth() { const s = getSpherical(); flyTo({ x: controls.target.x, z: controls.target.z, az: 0, dur: 700, dist: s.r, polar: s.phi }); },
    azimuth() { return getSpherical().theta; },
    idle(v) { idleOrbit = v; },
    lastTouch: () => lastTouch
  };
}
