// Three.js instanced-mesh orb. Ported from Eno (ui/orb/renderer.ts, MIT) and trimmed to what the
// Briefing needs: states, a tone tint while speaking, and the voice level. An icosahedron whose
// vertices drift with value noise, every edge as an instanced strut, every vertex as a node, a
// fresnel halo, a glowing core and a point-cloud corona.

import * as THREE from "three";
import { ORB_BEHAVIOR, ORB_PALETTE, TINT_GLOW, VISUALS, type OrbBehavior, type OrbState, type OrbStateName, type OrbTint } from "./palette";
import { BODY_FRAG, BODY_VERT, CORE_FRAG, CORONA_FRAG, CORONA_VERT, RING_FRAG, VIEW_VERT } from "./shader";
import { FpsGuard, TIERS, probeTier, type GraphicsTier, type TierSpec } from "./tiers";

const TRANSITION_MS = 250;
const FAILED_PULSES = 3;
const FAILED_PULSE_HZ = 3.0;
const FAILED_DECAY_MS = 600;
/** Speech rhythm while speaking, in Hz, used between voice-level updates. */
const SPEAKING_HZ = 4.2;
/** A voice level older than this has stopped arriving; the rhythm takes over again. */
const LEVEL_FRESH_MS = 200;

interface Target extends OrbBehavior {
  coreR: number; coreG: number; coreB: number;
  glowR: number; glowG: number; glowB: number;
}

function targetFor(state: OrbStateName, tint: OrbTint | undefined): Target {
  const b = ORB_BEHAVIOR[state];
  const p = ORB_PALETTE[state];
  const core = new THREE.Color(p.core);
  const glow = new THREE.Color(state === "speaking" && tint ? TINT_GLOW[tint] : p.glow);
  return { ...b, coreR: core.r, coreG: core.g, coreB: core.b, glowR: glow.r, glowG: glow.g, glowB: glow.b };
}

/** Additive colour with a normal "over" alpha, so the halo keeps its colour on a transparent canvas. */
function glowBlending(m: THREE.Material): void {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface RendererOptions {
  reduceMotion?: boolean;
  onTierChange?: (tier: GraphicsTier) => void;
  /** WebGL cannot be used at all; the host shows a CSS orb instead. */
  onFallback?: (reason: string) => void;
}

/** CPU-side value noise, so struts and nodes read the exact same displacement as the body mesh. */
const PERM = (() => {
  const p = new Uint8Array(512);
  let seed = 1337;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let j = 255; j > 0; j--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const k = seed % (j + 1);
    const t = p[j]; p[j] = p[k]; p[k] = t;
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return p;
})();
const fade = (t: number): number => t * t * (3 - 2 * t);
function grad(h: number, x: number, y: number, z: number): number {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x + z; case 5: return -x + z; case 6: return x - z; default: return -x - z;
  }
}
function noise3(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u),
      lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

interface Edge { a: number; b: number }

export class OrbRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private group: THREE.Group | null = null;

  private body: THREE.Mesh | null = null;
  private bodyMat: THREE.ShaderMaterial | null = null;
  private edges: THREE.InstancedMesh | null = null;
  private edgeMat: THREE.MeshBasicMaterial | null = null;
  private nodes: THREE.InstancedMesh | null = null;
  private nodeMat: THREE.MeshBasicMaterial | null = null;
  private ring: THREE.Mesh | null = null;
  private ringMat: THREE.ShaderMaterial | null = null;
  private core: THREE.Mesh | null = null;
  private coreMat: THREE.ShaderMaterial | null = null;
  private corona: THREE.Points | null = null;
  private coronaMat: THREE.ShaderMaterial | null = null;

  private edgeList: Edge[] = [];
  private vertexList: THREE.Vector3[] = [];
  private cornerVertex: Int32Array | null = null;
  private dispAttr: THREE.BufferAttribute | null = null;
  private vertexDisp: Float32Array | null = null;

  private dummy = new THREE.Object3D();
  private upVec = new THREE.Vector3(0, 1, 0);
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

  private raf = 0;
  private running = false;
  private disposed = false;
  private ready = false;

  private tier: GraphicsTier = "medium";
  private guard: FpsGuard | null = null;

  private state: OrbStateName = "idle";
  private tint: OrbTint | undefined;
  private from: Target;
  private to: Target;
  private current: Target;
  private transitionStart = 0;
  private failedStart = 0;

  private colCore = new THREE.Color();
  private colGlow = new THREE.Color();

  private spinAngle = 0;
  private lastFrame = 0;
  private startTime = performance.now();
  private exPulse = 0;
  private exFlow = 0;
  private voiceLevel = 0;
  private voiceLevelAt = -Infinity;

  private readonly reduceMotion: boolean;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly opts: RendererOptions = {}) {
    this.reduceMotion = opts.reduceMotion ?? false;
    const initial = targetFor("idle", undefined);
    this.from = { ...initial };
    this.to = { ...initial };
    this.current = { ...initial };

    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    if (!this.init()) return;
    this.start();
  }

  private init(): boolean {
    try {
      const gl = this.canvas.getContext("webgl2", {
        alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: "low-power",
      });
      if (!gl) {
        this.opts.onFallback?.("WebGL2 unavailable");
        return false;
      }
      const ceiling = probeTier(gl);
      this.tier = ceiling;
      this.guard = new FpsGuard(this.tier, ceiling, (t) => this.applyTier(t));
      this.build(gl);
      this.opts.onTierChange?.(this.tier);
      return true;
    } catch (err) {
      console.error("orb: build failed", err);
      this.opts.onFallback?.("shader compilation failed");
      return false;
    }
  }

  // ---------------- geometry ----------------

  private buildGeometry(detail: number): THREE.BufferGeometry {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    if (geo.index) geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    const pos = geo.attributes.position;
    this.dispAttr = new THREE.BufferAttribute(new Float32Array(pos.count), 1);
    geo.setAttribute("aDisp", this.dispAttr);
    this.cornerVertex = new Int32Array(pos.count);

    const vmap = new Map<string, number>();
    const emap = new Set<string>();
    this.vertexList = [];
    this.edgeList = [];
    const vkey = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;

    for (let t = 0; t < pos.count; t += 3) {
      const idx = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const i = t + c;
        const k = vkey(i);
        let vi = vmap.get(k);
        if (vi === undefined) {
          vi = this.vertexList.length;
          vmap.set(k, vi);
          this.vertexList.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        }
        idx[c] = vi;
        this.cornerVertex[i] = vi;
      }
      for (let e = 0; e < 3; e++) {
        const a = idx[e], b = idx[(e + 1) % 3];
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!emap.has(id)) { emap.add(id); this.edgeList.push({ a, b }); }
      }
    }
    this.vertexDisp = new Float32Array(this.vertexList.length);
    return geo;
  }

  private nodeRadius(detail: number): number {
    return Math.min(0.022, Math.max(0.0045, 0.022 / (detail + 1)));
  }

  private disposeMesh(m: THREE.Object3D | null): void {
    if (!m || !this.group) return;
    (m as THREE.Mesh).geometry?.dispose();
    this.group.remove(m);
  }

  private rebuildBody(spec: TierSpec): void {
    if (!this.ready || !this.body || !this.group || !this.edgeMat || !this.nodeMat) return;
    this.body.geometry.dispose();
    this.body.geometry = this.buildGeometry(spec.detail);

    this.disposeMesh(this.edges);
    this.edges = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, spec.edgeSides, 1, true), this.edgeMat, this.edgeList.length);
    this.edges.renderOrder = 5;
    this.edges.frustumCulled = false;
    this.group.add(this.edges);

    this.disposeMesh(this.nodes);
    this.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(this.nodeRadius(spec.detail), 6, 4), this.nodeMat, this.vertexList.length);
    this.nodes.renderOrder = 6;
    this.nodes.frustumCulled = false;
    this.group.add(this.nodes);
  }

  private rebuildCorona(spec: TierSpec): void {
    if (!this.corona) return;
    const v = VISUALS;
    const n = Math.max(0, Math.round(v.corona_count * spec.coronaMultiplier));
    const field = Math.round(n * v.field_share);
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), fld = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const far = i >= n - field;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = far ? 0.7 + Math.random() * 1.5 : v.cluster_radius * Math.pow(Math.random(), v.cluster_focus);
      pos[i * 3] = s * Math.cos(th) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(th) * r;
      seed[i] = Math.random();
      fld[i] = far ? 1 : 0;
    }
    this.corona.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.corona.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.corona.geometry.setAttribute("aField", new THREE.BufferAttribute(fld, 1));
  }

  // ---------------- build ----------------

  private build(gl: WebGL2RenderingContext): void {
    const spec = TIERS[this.tier];
    const v = VISUALS;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: gl, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = v.exposure;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const p = ORB_PALETTE[this.state];
    this.colCore.setHex(p.core);
    this.colGlow.setHex(p.glow);

    const geo = this.buildGeometry(spec.detail);

    this.bodyMat = new THREE.ShaderMaterial({
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uCore: { value: this.colCore.clone() }, uGlow: { value: this.colGlow.clone() },
        uFresnel: { value: v.fresnel }, uGlowAmt: { value: v.glow },
        uAlpha: { value: v.body_alpha }, uFlow: { value: 0 }, uSparkle: { value: 0 },
        uExposure: { value: v.exposure },
      },
    });
    this.body = new THREE.Mesh(geo, this.bodyMat);
    this.body.renderOrder = 2;
    this.body.frustumCulled = false;
    this.group.add(this.body);

    this.edgeMat = new THREE.MeshBasicMaterial({ color: this.colGlow, transparent: true, opacity: v.edge_glow, depthWrite: false });
    this.edges = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, spec.edgeSides, 1, true), this.edgeMat, this.edgeList.length);
    this.edges.renderOrder = 5;
    this.edges.frustumCulled = false;
    this.group.add(this.edges);

    this.nodeMat = new THREE.MeshBasicMaterial({ color: this.colGlow, transparent: true, opacity: 0.9, depthWrite: false });
    this.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(this.nodeRadius(spec.detail), 6, 4), this.nodeMat, this.vertexList.length);
    this.nodes.renderOrder = 6;
    this.nodes.frustumCulled = false;
    this.group.add(this.nodes);

    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: VIEW_VERT, fragmentShader: RING_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false,
      uniforms: {
        uGlow: { value: this.colGlow.clone() }, uPower: { value: v.ring_power },
        uStrength: { value: v.ring_strength }, uPulse: { value: 0 }, uExposure: { value: v.exposure },
      },
    });
    this.ring = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.ringMat);
    this.ring.renderOrder = 1;
    this.ring.frustumCulled = false;
    this.ring.scale.setScalar(v.ring_scale);
    this.ring.visible = spec.ring;
    this.group.add(this.ring);

    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: VIEW_VERT, fragmentShader: CORE_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uGlow: { value: this.colGlow.clone() }, uPulse: { value: 1 },
        uAmount: { value: v.core_glow }, uExposure: { value: v.exposure },
      },
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(v.core_size, spec.coreSegments, Math.max(8, Math.round(spec.coreSegments / 2))), this.coreMat);
    this.core.renderOrder = 3;
    this.core.frustumCulled = false;
    this.group.add(this.core);

    this.coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT, fragmentShader: CORONA_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uSparkle: { value: 0 }, uDrift: { value: v.corona_drift },
        uSize: { value: v.corona_size }, uGlow: { value: this.colGlow.clone() }, uExposure: { value: v.exposure },
        uBaseHue: { value: 0 }, uHueSpread: { value: v.hue_spread }, uHuePhase: { value: v.hue_phase },
        uStateTint: { value: v.state_tint }, uRadius: { value: v.cluster_radius },
        uCoreHeat: { value: v.core_heat }, uPixelRatio: { value: 1 }, uDim: { value: 1 },
      },
    });
    [this.ringMat, this.coreMat, this.coronaMat].forEach(glowBlending);
    this.corona = new THREE.Points(new THREE.BufferGeometry(), this.coronaMat);
    this.corona.renderOrder = 4;
    this.corona.frustumCulled = false;
    this.group.add(this.corona);
    this.rebuildCorona(spec);

    this.ready = true;
    this.resize();
    this.renderer.compile(this.scene, this.camera);
  }

  private applyTier(tier: GraphicsTier): void {
    if (this.disposed || tier === this.tier || !this.ready) return;
    this.tier = tier;
    const spec = TIERS[tier];
    this.rebuildBody(spec);
    this.rebuildCorona(spec);
    if (this.ring) this.ring.visible = spec.ring;
    if (this.core) {
      this.core.geometry.dispose();
      this.core.geometry = new THREE.SphereGeometry(VISUALS.core_size, spec.coreSegments, Math.max(8, Math.round(spec.coreSegments / 2)));
    }
    this.resize();
    this.opts.onTierChange?.(tier);
  }

  // ---------------- state ----------------

  setState(next: OrbState): void {
    if (!(next.state in ORB_BEHAVIOR)) return; // unknown states hold the current look rather than throw
    if (typeof next.level === "number") {
      this.voiceLevel = Math.max(0, Math.min(1, next.level));
      this.voiceLevelAt = performance.now();
      // A level update must not restart the colour transition.
      if (next.state === this.state && next.tint === this.tint) return;
    }
    if (next.state === this.state && next.tint === this.tint) return;

    this.from = { ...this.current };
    this.to = targetFor(next.state, next.tint);
    this.transitionStart = performance.now();
    if (next.state === "failed" && this.state !== "failed") this.failedStart = this.transitionStart;
    this.state = next.state;
    this.tint = next.tint;
    this.start();
  }

  private start(): void {
    if (this.running || this.disposed || !this.ready) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const spec = TIERS[this.tier];
    const dpr = Math.min(window.devicePixelRatio || 1, spec.dprCap);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.coronaMat) this.coronaMat.uniforms.uPixelRatio.value = dpr;
    this.camera.aspect = w / h;
    let fit = 2 / (0.52 * 2 * Math.tan((this.camera.fov * Math.PI) / 360));
    if (this.camera.aspect < 1) fit /= this.camera.aspect;
    this.camera.position.set(0, 0.08, fit);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  // ---------------- per-frame update ----------------

  private updateFacets(time: number): void {
    if (!this.vertexList.length || !this.dispAttr || !this.vertexDisp || !this.cornerVertex) return;
    if (!this.edges || !this.nodes) return;
    const v = VISUALS;
    const ns = v.noise_scale;
    const n = this.vertexList.length;

    for (let i = 0; i < n; i++) {
      if (this.reduceMotion) { this.vertexDisp[i] = 0; continue; }
      const p = this.vertexList[i];
      const slow = noise3(p.x * ns, p.y * ns + time * 0.35, p.z * ns);
      const fast = noise3(p.x * ns * 2 + 11.3, p.y * ns * 2 - time * 1.4, p.z * ns * 2);
      this.vertexDisp[i] = slow * v.facet_drift + fast * v.speech_swell * this.exFlow + this.exPulse * v.pulse_swell;
    }

    const arr = this.dispAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] = this.vertexDisp[this.cornerVertex[i]];
    this.dispAttr.needsUpdate = true;

    for (let e = 0; e < this.edgeList.length; e++) {
      const ed = this.edgeList[e];
      this.tmpA.copy(this.vertexList[ed.a]).multiplyScalar(1 + this.vertexDisp[ed.a]);
      this.tmpB.copy(this.vertexList[ed.b]).multiplyScalar(1 + this.vertexDisp[ed.b]);
      this.tmpC.subVectors(this.tmpB, this.tmpA);
      const len = this.tmpC.length();
      this.dummy.position.copy(this.tmpA).add(this.tmpB).multiplyScalar(0.5);
      this.dummy.quaternion.setFromUnitVectors(this.upVec, this.tmpC.divideScalar(len || 1));
      this.dummy.scale.set(v.edge_width, len, v.edge_width);
      this.dummy.updateMatrix();
      this.edges.setMatrixAt(e, this.dummy.matrix);
    }
    this.edges.instanceMatrix.needsUpdate = true;

    this.dummy.quaternion.set(0, 0, 0, 1);
    this.dummy.scale.set(1, 1, 1);
    for (let i = 0; i < n; i++) {
      this.dummy.position.copy(this.vertexList[i]).multiplyScalar(1 + this.vertexDisp[i]);
      this.dummy.updateMatrix();
      this.nodes.setMatrixAt(i, this.dummy.matrix);
    }
    this.nodes.instanceMatrix.needsUpdate = true;
  }

  private stepExcitation(time: number, dt: number): void {
    const t = Math.min(1, (performance.now() - this.transitionStart) / TRANSITION_MS);
    const e = easeInOutCubic(t);
    (Object.keys(this.to) as (keyof Target)[]).forEach((k) => {
      this.current[k] = lerp(this.from[k], this.to[k], e);
    });

    if (this.state === "failed") {
      const elapsed = performance.now() - this.failedStart;
      const pulseMs = 1000 / FAILED_PULSE_HZ;
      const burstMs = pulseMs * FAILED_PULSES;
      if (elapsed < burstMs) {
        const phase = (elapsed % pulseMs) / pulseMs;
        this.exPulse = 1 - Math.pow(phase, 0.4);
      } else if (elapsed < burstMs + FAILED_DECAY_MS) {
        this.exPulse = (1 - (elapsed - burstMs) / FAILED_DECAY_MS) * 0.4;
      } else {
        this.exPulse = 0;
      }
    } else {
      this.exPulse = Math.sin(time * this.current.pulseHz * Math.PI * 2) * this.current.depth;
    }

    let flow = this.current.flow;
    if (this.state === "speaking") {
      const voiced = performance.now() - this.voiceLevelAt < LEVEL_FRESH_MS;
      if (voiced) flow *= 0.35 + 0.65 * Math.min(1, this.voiceLevel * 1.4);
      else flow *= 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(time * SPEAKING_HZ * Math.PI)), 1.6);
    }
    this.exFlow = dt > 0 ? lerp(this.exFlow, flow, Math.min(1, dt * 6)) : flow;
  }

  private pushUniforms(): void {
    if (!this.bodyMat || !this.ringMat || !this.coreMat || !this.coronaMat || !this.edgeMat || !this.nodeMat) return;
    const v = VISUALS;
    this.colCore.setRGB(this.current.coreR, this.current.coreG, this.current.coreB);
    this.colGlow.setRGB(this.current.glowR, this.current.glowG, this.current.glowB);

    this.bodyMat.uniforms.uCore.value.copy(this.colCore);
    this.bodyMat.uniforms.uGlow.value.copy(this.colGlow);
    this.bodyMat.uniforms.uFlow.value = this.exFlow;
    this.bodyMat.uniforms.uSparkle.value = this.current.sparkle;

    this.ringMat.uniforms.uGlow.value.copy(this.colGlow);
    this.ringMat.uniforms.uPulse.value = this.exPulse;
    this.ringMat.uniforms.uStrength.value = v.ring_strength * this.current.ring;

    this.coreMat.uniforms.uGlow.value.copy(this.colGlow);
    this.coreMat.uniforms.uPulse.value = 1 + this.exPulse;

    this.coronaMat.uniforms.uGlow.value.copy(this.colGlow);
    this.coronaMat.uniforms.uSparkle.value = this.current.sparkle;
    const hsl = { h: 0, s: 0, l: 0 };
    this.colGlow.getHSL(hsl);
    this.coronaMat.uniforms.uBaseHue.value = hsl.h;

    this.edgeMat.color.copy(this.colGlow);
    this.nodeMat.color.copy(this.colGlow);
  }

  private frame = (now: number): void => {
    if (!this.running || this.disposed) return;
    const delta = now - this.lastFrame;
    this.lastFrame = now;
    this.guard?.sample(delta);

    const dt = Math.min(delta / 1000, 0.1);
    const time = this.reduceMotion ? 0 : (now - this.startTime) / 1000;

    this.stepExcitation(time, dt);
    this.updateFacets(time);

    if (!this.reduceMotion && this.group) {
      this.spinAngle += ((this.current.yaw * Math.PI) / 180) * dt;
      this.group.rotation.y = this.spinAngle;
      this.group.position.y = Math.sin((time * Math.PI * 2) / 6) * 0.04;
    }
    if (this.coronaMat) this.coronaMat.uniforms.uTime.value = time;

    this.pushUniforms();
    if (this.renderer && this.scene && this.camera) {
      this.resize();
      this.renderer.render(this.scene, this.camera);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault(); // required, or the context is never restored
    this.stop();
    this.ready = false;
  };

  private onContextRestored = (): void => {
    if (this.disposed) return;
    if (this.init()) this.start();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  destroy(): void {
    this.disposed = true;
    this.stop();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    [this.bodyMat, this.edgeMat, this.nodeMat, this.ringMat, this.coreMat, this.coronaMat].forEach((m) => m?.dispose());
    [this.body, this.edges, this.nodes, this.ring, this.core, this.corona].forEach((m) => (m as THREE.Mesh | null)?.geometry?.dispose());
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
  }
}
