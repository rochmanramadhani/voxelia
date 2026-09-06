'use strict';
/* Shaders, written in GLSL1 style. Three.js lifts them to "#version 300 es" on
   WebGL2 by itself and supplies pc_fragColor plus the sampler2DArray precision. */

const MAX_LIGHTS = 12;

const U = {
  uAtlas:   { value: null },
  uTime:    { value: 0 },
  uSunDir:  { value: new THREE.Vector3(0.4, 0.8, 0.3) },
  uSunCol:  { value: new THREE.Color(1.0, 0.96, 0.86) },
  uAmbient: { value: new THREE.Color(0.32, 0.36, 0.45) },
  uFogCol:  { value: new THREE.Color(0.62, 0.74, 0.88) },
  uFogNear: { value: 40 },
  uFogFar:  { value: 150 },
  uLights:  { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uLightN:  { value: 0 },
  uLightCol:{ value: new THREE.Color(1.0, 0.72, 0.34) },
  uTorch:   { value: 0.0 },
  uUnder:   { value: 0.0 },
  uExposure:{ value: 1.05 },
  uAOAmt:   { value: 1.0 },
  uWaveAmt: { value: 1.0 },
  uCam:     { value: new THREE.Vector3() }
};

const COMMON_HEAD = `
precision highp float;
uniform sampler2DArray uAtlas;
uniform float uTime, uFogNear, uFogFar, uTorch, uUnder, uExposure, uAOAmt, uWaveAmt;
uniform vec3 uSunDir, uCam;
uniform vec3 uSunCol, uAmbient, uFogCol, uLightCol;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform int uLightN;
`;

const VERT = COMMON_HEAD + `
attribute vec3 aPos;
attribute vec4 aData;
varying vec2 vUv;
varying float vLayer, vAO, vSky, vFace;
varying vec3 vWorld;
void main(){
  int flags = int(aData.w + 0.5);
  int face  = flags & 7;
  float u = float((flags >> 3) & 1);
  float v = float((flags >> 4) & 1);
  float wave = float((flags >> 5) & 1);

  vec3 p = aPos / 8.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);

  if (wave > 0.5) {
    float t = uTime;
    wp.x += sin(t * 1.7 + wp.x * 0.7 + wp.z * 0.4) * 0.075 * uWaveAmt;
    wp.z += cos(t * 1.4 + wp.z * 0.8 - wp.x * 0.3) * 0.075 * uWaveAmt;
    wp.y += sin(t * 2.1 + wp.x * 0.9) * 0.022 * uWaveAmt;
  }

  vUv   = vec2(u, v);
  vLayer= aData.z;
  vAO   = mix(1.0, aData.x / 255.0, uAOAmt);
  vSky  = aData.y / 255.0;
  vFace = float(face);
  vWorld= wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG_LIB = `
const vec3 FN[7] = vec3[7](vec3(-1.,0.,0.),vec3(1.,0.,0.),vec3(0.,-1.,0.),vec3(0.,1.,0.),vec3(0.,0.,-1.),vec3(0.,0.,1.),vec3(0.,1.,0.));
const float FS[7] = float[7](0.80,0.84,0.58,1.0,0.89,0.92,0.95);

vec3 tonemap(vec3 x){
  x *= uExposure;
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
vec3 pointLights(vec3 wp, vec3 n){
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++){
    if (i >= uLightN) break;
    vec4 L = uLights[i];
    vec3 d = L.xyz - wp;
    float dist = length(d);
    float att = clamp(1.0 - dist / L.w, 0.0, 1.0);
    att *= att;
    float nd = 0.55 + 0.45 * max(dot(n, normalize(d + vec3(0.001))), 0.0);
    s += uLightCol * att * nd * 1.9;
  }
  return s;
}
float fogAmount(float dist){
  float f = smoothstep(uFogNear, uFogFar, dist);
  float uw = 1.0 - exp(-dist * 0.042);
  return mix(f, max(f, uw), uUnder);
}
vec3 fogColorAt(){
  return mix(uFogCol, vec3(0.07, 0.29, 0.45), uUnder);
}
`;

const FRAG = COMMON_HEAD + `
varying vec2 vUv;
varying float vLayer, vAO, vSky, vFace;
varying vec3 vWorld;
` + FRAG_LIB + `
void main(){
  vec4 tex = texture(uAtlas, vec3(vUv, vLayer));
  if (tex.a < 0.5) discard;
  vec3 albedo = pow(tex.rgb, vec3(2.2));

  int f = int(vFace + 0.5);
  vec3 N = FN[f];
  float faceShade = FS[f];

  float nd = max(dot(N, uSunDir), 0.0);
  vec3 lit = uAmbient * (0.34 + 0.66 * vSky);
  lit += uSunCol * (0.34 + 0.66 * nd) * vSky;
  lit *= vAO * faceShade;
  lit += pointLights(vWorld, N) * (0.55 + 0.45 * vAO);

  float dist = distance(uCam, vWorld);
  if (uTorch > 0.001){
    float att = clamp(1.0 - dist / 15.0, 0.0, 1.0); att *= att;
    lit += uLightCol * att * uTorch * 1.5 * (0.6 + 0.4 * faceShade);
  }

  vec3 col = pow(tonemap(albedo * lit), vec3(1.0/2.2));
  col = mix(col, fogColorAt(), fogAmount(dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_LIQ = COMMON_HEAD + `
varying vec2 vUv;
varying float vLayer, vAO, vSky, vFace;
varying vec3 vWorld;
` + FRAG_LIB + `
void main(){
  vec2 uv = vUv;
  int f = int(vFace + 0.5);
  bool lava = vLayer > ${T.lava - 0.5};
  if (f == 3){
    uv += vec2(sin(uTime * 0.6 + vWorld.z * 0.25), cos(uTime * 0.5 + vWorld.x * 0.25)) * (lava ? 0.10 : 0.03);
  }
  vec4 tex = texture(uAtlas, vec3(fract(uv), vLayer));
  vec3 albedo = pow(tex.rgb, vec3(2.2));
  vec3 N = FN[f];

  vec3 lit;
  if (lava){
    lit = vec3(2.3, 1.35, 0.62) + 0.5 * sin(uTime * 1.4 + vWorld.x + vWorld.z);
  } else {
    float nd = max(dot(N, uSunDir), 0.0);
    lit = uAmbient * (0.34 + 0.66 * vSky) + uSunCol * (0.30 + 0.70 * nd) * vSky;
    lit += pointLights(vWorld, N);
    // sun glint on the water surface
    vec3 V = normalize(uCam - vWorld);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    lit += uSunCol * spec * 2.6 * vSky;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += pow(uFogCol, vec3(2.2)) * fres * 0.9 * vSky;
  }

  vec3 col = pow(tonemap(albedo * lit), vec3(1.0/2.2));
  float dist = distance(uCam, vWorld);
  col = mix(col, fogColorAt(), fogAmount(dist));
  gl_FragColor = vec4(col, tex.a);
}
`;

function makeTerrainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.FrontSide, transparent: false, fog: false
  });
}
function makeLiquidMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG_LIQ,
    side: THREE.FrontSide, transparent: true, depthWrite: false, fog: false
  });
}

/* --------- items: the small cube used for icons and the held block --------- */
const ITEM_FRAG = COMMON_HEAD + `
varying vec2 vUv;
varying float vLayer, vAO, vSky, vFace;
varying vec3 vWorld;
` + FRAG_LIB + `
void main(){
  vec4 tex = texture(uAtlas, vec3(vUv, vLayer));
  if (tex.a < 0.35) discard;
  vec3 albedo = pow(tex.rgb, vec3(2.2));
  int f = int(vFace + 0.5);
  vec3 N = FN[f];
  float nd = max(dot(N, normalize(vec3(0.45, 0.85, 0.35))), 0.0);
  vec3 lit = vec3(0.42, 0.45, 0.52) + vec3(1.15, 1.08, 0.95) * (0.25 + 0.75 * nd);
  lit *= FS[f] * 0.55 + 0.45;
  vec3 col = pow(tonemap(albedo * lit * vSky), vec3(1.0/2.2));
  gl_FragColor = vec4(col, tex.a);
}
`;
function makeItemMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: ITEM_FRAG,
    side: THREE.FrontSide, transparent: true, fog: false
  });
}

/* --------- sky --------- */
const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunCol, uGround;
uniform float uNight, uTime;

float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;

  vec3 sky = mix(uHorizon, uMid, smoothstep(-0.02, 0.28, h));
  sky = mix(sky, uTop, smoothstep(0.22, 0.8, h));
  sky = mix(uGround, sky, smoothstep(-0.55, 0.0, h));

  // stars
  float sd = dot(d, uSunDir);
  if (uNight > 0.01 && h > -0.05){
    vec3 g = floor(d * 210.0);
    float s = hash13(g);
    float star = smoothstep(0.9975, 0.99995, s);
    float tw = 0.65 + 0.35 * sin(uTime * 2.2 + s * 90.0);
    sky += vec3(0.95, 0.96, 1.0) * star * tw * uNight * smoothstep(-0.02, 0.25, h);
  }

  // sun glow plus the disc itself
  float glow = pow(max(sd, 0.0), 26.0);
  sky += uSunCol * glow * 0.85;
  sky += uSunCol * pow(max(sd, 0.0), 900.0) * 3.2;
  float disc = smoothstep(0.99885, 0.99935, sd);
  sky = mix(sky, uSunCol * 1.9, disc);

  // the moon sits opposite the sun
  float md = dot(d, -uSunDir);
  float moon = smoothstep(0.9992, 0.99955, md);
  float crater = hash13(floor(d * 300.0));
  sky = mix(sky, vec3(0.86, 0.88, 0.92) * (0.82 + 0.18 * crater), moon * uNight);
  sky += vec3(0.5, 0.55, 0.7) * pow(max(md, 0.0), 300.0) * 0.5 * uNight;

  gl_FragColor = vec4(sky, 1.0);
}
`;

/* --------- blocky clouds --------- */
const CLOUD_FRAG = `
precision highp float;
varying vec2 vUvC;
varying vec3 vWp;
uniform float uTime, uOpacity, uPlaneY;
uniform vec3 uColor, uShade, uFogCol, uCamP;
uniform float uFogNear, uFogFar;

float h2(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main(){
  // noise is sampled in world space so clouds do not drift with the camera
  vec2 p = vWp.xz * 0.0075 + vec2(uTime * 0.0045, uTime * 0.0016);
  vec2 q = floor(p * 7.0) / 7.0;          // quantise -> blocky edges
  float n = fbm(q);
  float m = smoothstep(0.50, 0.60, n);
  if (m < 0.02) discard;
  float edge = smoothstep(0.50, 0.72, n);
  vec3 c = mix(uShade, uColor, edge);
  float d = distance(uCamP.xz, vWp.xz);
  float fog = smoothstep(300.0, 1150.0, d);
  // near the cloud layer -> fade out; above it -> much thinner, not a solid slab
  float dy = uCamP.y - uPlaneY;
  float fade = smoothstep(1.0, 10.0, abs(dy)) * (dy > 0.0 ? 0.34 : 1.0);
  gl_FragColor = vec4(mix(c, uFogCol, fog), m * uOpacity * fade * (1.0 - fog * 0.9));
}
`;
const CLOUD_VERT = `
varying vec2 vUvC;
varying vec3 vWp;
void main(){
  vUvC = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
