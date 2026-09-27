// GLSL for the crystal orb: a displaced icosahedron body, a fresnel halo, a glowing core and a
// point-cloud corona. Ported from Eno (ui/orb/shader.ts, MIT) with the uniforms Stone uses.
// These are THREE.ShaderMaterial sources: Three.js injects precision, the matrices and the
// standard position/normal attributes, so only the orb-specific pieces are declared here.

/** Body: `aDisp` is computed on the CPU (renderer.ts) so the edge struts and the corner nodes
    read the identical displacement and stay welded to the facets. */
export const BODY_VERT = `
attribute float aDisp;
varying vec3 vN; varying vec3 vP; varying float vD;
void main() {
  vN = normalize(normalMatrix * normal);
  vD = aDisp;
  vec4 mv = modelViewMatrix * vec4(position * (1.0 + aDisp), 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const BODY_FRAG = `
uniform vec3 uCore; uniform vec3 uGlow;
uniform float uFresnel, uGlowAmt, uAlpha, uFlow, uSparkle, uExposure;
varying vec3 vN; varying vec3 vP; varying float vD;
void main() {
  vec3 view = normalize(-vP);
  float fres = pow(1.0 - max(dot(view, normalize(vN)), 0.0), uFresnel);
  vec3 base = mix(uCore, uGlow, clamp(fres + vD * 2.0, 0.0, 1.0));
  float lum = (uFlow * 0.6 + uSparkle * 0.4) * uGlowAmt;
  gl_FragColor = vec4((base + uGlow * lum) * uExposure, uAlpha);
}
`;

/** Shared by the ring and the core: plain view-space fresnel shells. */
export const VIEW_VERT = `
varying vec3 vN; varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const RING_FRAG = `
uniform vec3 uGlow; uniform float uPower, uStrength, uPulse, uExposure;
varying vec3 vN; varying vec3 vP;
void main() {
  vec3 view = normalize(-vP);
  float fres = pow(1.0 - abs(dot(view, normalize(vN))), uPower);
  gl_FragColor = vec4(uGlow * uExposure, clamp(fres * uStrength * (1.0 + uPulse * 0.6), 0.0, 1.0));
}
`;

export const CORE_FRAG = `
uniform vec3 uGlow; uniform float uPulse, uAmount, uExposure;
varying vec3 vN; varying vec3 vP;
void main() {
  vec3 view = normalize(-vP);
  float facing = max(dot(view, normalize(vN)), 0.0);
  float f = 0.22 + 0.78 * pow(facing, 1.3);
  gl_FragColor = vec4(uGlow * uExposure, clamp(uAmount * uPulse * f * 0.85, 0.0, 1.0));
}
`;

/** Corona: hue from the point's direction, saturation and lightness from its distance to the
    centre, collapsing to a hot white core. Point size scales by the pixel ratio (a fixed
    screen-space size looks right at one camera distance and wrong at any other). */
export const CORONA_VERT = `
attribute float aSeed;
attribute float aField;   // 0: cluster node, 1: sparse outer star
uniform float uTime, uSparkle, uDrift, uSize, uPixelRatio;
uniform float uBaseHue, uHueSpread, uHuePhase, uStateTint, uRadius, uCoreHeat;
uniform float uDim;
uniform vec3 uGlow;
varying float vA; varying vec3 vCol;
vec3 hsl2rgb(vec3 c) {
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + c.x * 12.0, 12.0);
  float a = c.y * min(c.z, 1.0 - c.z);
  return c.z - a * max(min(min(k - 3.0, 9.0 - k), 1.0), -1.0);
}
void main() {
  float bound = 1.0 - aField;
  vec3 p = position * (1.0 + uSparkle * uDrift * (0.4 + aSeed * 0.6) * bound);
  float a = uTime * 0.12 * (1.0 - aField * 0.8);
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);

  float turn = atan(position.y, position.x) / 6.2831853 + 0.5;
  float wheel = uHuePhase + uBaseHue * uStateTint + turn * uHueSpread;
  float t = clamp(length(position) / max(uRadius, 0.001), 0.0, 1.0);
  float hue = mix(0.92, wheel, smoothstep(0.20, 0.70, t));
  float w = smoothstep(0.02, 0.10 + uCoreHeat * 0.42, t);
  float sat = mix(mix(0.02, 0.95, w), 0.10, aField);
  float lum = mix(mix(0.99, 0.58, smoothstep(0.05, 0.55, t)), 0.82, aField);
  vec3 tinted = hsl2rgb(vec3(fract(hue), sat, lum));
  vCol = mix(uGlow, tinted, uHueSpread > 0.001 ? 1.0 : 0.0);

  vA = (0.38 + uSparkle * 0.62) * (0.45 + aSeed * 0.55) * (1.0 - aField * 0.35) * (1.0 + (1.0 - t) * 0.5) * uDim;
  gl_PointSize = uSize * uPixelRatio * (8.0 / -mv.z) * (0.5 + aSeed) * (1.0 - aField * 0.5) * mix(0.35, 1.0, uDim);
  gl_Position = projectionMatrix * mv;
}
`;

export const CORONA_FRAG = `
uniform float uExposure; varying float vA; varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  gl_FragColor = vec4(vCol * uExposure, vA * (1.0 - d * 2.0));
}
`;
