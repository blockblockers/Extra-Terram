// Extra Terram — src/render/ground.ts v0.1.0 — the lit ground: the board drawn to a texture, shown through the camera's perspective with a normal map under a sun and the shots' light
// Everything that lies on the ground (the painting, pad rings, aura fields, shadows, the placing
// ring) is rendered into one texture a frame, and a perspective mesh shows that texture in the
// camera's trapezoid. Its shader lights the texture with a normal map: fine grain from the
// painting's own brightness, and relief from the map's layout (the trail a sunken channel with
// banks, each pad a low plateau, the edge falling away), under a fixed sun from the upper left and
// up to 16 short-lived lights the renderer raises where shots fire and land. The normal map is
// built once per map from the painting and the grid.
import { GlProgram, Mesh, PerspectivePlaneGeometry, RenderTexture, Shader, Texture, UniformGroup, type Container, type Renderer as PixiRendererType } from 'pixi.js';
import type { SimContext } from '../engine';

export const MAX_LIGHTS = 16;

interface Light {
  x: number; // board px
  y: number;
  r: number; // board px
  g: number;
  b: number;
  radius: number; // board px
  intensity: number;
  life: number;
  maxLife: number;
}

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

const FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uNormal;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uAspect;
uniform float uLightCount;
uniform float uLit;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec4 uLightColors[${MAX_LIGHTS}];
void main() {
  vec4 albedo = texture(uTexture, vUV);
  vec3 n = normalize(texture(uNormal, vUV).xyz * 2.0 - 1.0);
  vec3 light = uAmbient + uSunColor * max(0.0, dot(n, uSunDir));
  vec2 p = vec2(vUV.x * uAspect, vUV.y);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (float(i) >= uLightCount) break;
    vec4 L = uLights[i];
    vec2 d = p - L.xy;
    float dist = length(d);
    float att = clamp(1.0 - dist / L.z, 0.0, 1.0);
    att *= att;
    vec3 ldir = normalize(vec3(-d.x, -d.y, 0.35));
    float ndl = 0.4 + 0.6 * max(0.0, dot(n, ldir));
    light += uLightColors[i].rgb * (att * L.w * ndl);
  }
  light = mix(vec3(1.0), light, uLit);
  finalColor = vec4(albedo.rgb * light, albedo.a);
}
`;

export class Ground {
  readonly mesh: Mesh<PerspectivePlaneGeometry, Shader>;
  readonly target: RenderTexture;
  private uniforms: UniformGroup;
  private lights: Light[] = [];
  private lightData = new Float32Array(MAX_LIGHTS * 4);
  private colorData = new Float32Array(MAX_LIGHTS * 4);
  private boardH: number;
  private lit = true;

  constructor(renderer: PixiRendererType, boardW: number, boardH: number, cols: number, rows: number, normal: Texture, resolution: number) {
    this.boardH = boardH;
    this.target = RenderTexture.create({ width: boardW, height: boardH, resolution, antialias: true });
    this.uniforms = new UniformGroup({
      uAmbient: { value: new Float32Array([0.72, 0.72, 0.76]), type: 'vec3<f32>' },
      uSunDir: { value: new Float32Array(sunDirection()), type: 'vec3<f32>' },
      uSunColor: { value: new Float32Array([0.5, 0.47, 0.42]), type: 'vec3<f32>' },
      uAspect: { value: boardW / boardH, type: 'f32' },
      uLightCount: { value: 0, type: 'f32' },
      uLit: { value: 1, type: 'f32' },
      uLights: { value: this.lightData, type: 'vec4<f32>', size: MAX_LIGHTS },
      uLightColors: { value: this.colorData, type: 'vec4<f32>', size: MAX_LIGHTS },
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'ground-lit' }),
      resources: { uTexture: this.target.source, uSampler: this.target.source.style, uNormal: normal.source, uNormalSampler: normal.source.style, groundUniforms: this.uniforms },
    });
    // enough cells that the trail's straight edges stay straight under the perspective
    this.mesh = new Mesh({ geometry: new PerspectivePlaneGeometry({ width: boardW, height: boardH, verticesX: Math.max(8, cols * 2), verticesY: Math.max(8, rows * 2) }), shader });
    void renderer;
  }

  /** Lighting on (normal map, sun, shots) or off (the texture as painted). */
  setLit(lit: boolean): void {
    this.lit = lit;
    this.uniforms.uniforms.uLit = lit ? 1 : 0;
  }

  setCorners(c: [number, number, number, number, number, number, number, number]): void {
    this.mesh.geometry.setCorners(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]);
  }

  /** A light at board (x, y): `radius` board px, fading over `life` ticks. The newest sixteen are drawn. */
  flash(x: number, y: number, color: number, radius: number, intensity: number, life: number): void {
    if (!this.lit) return;
    if (this.lights.length >= MAX_LIGHTS * 2) this.lights.shift();
    this.lights.push({ x, y, r: ((color >> 16) & 255) / 255, g: ((color >> 8) & 255) / 255, b: (color & 255) / 255, radius, intensity, life, maxLife: life });
  }

  /** Advance the lights by dt ticks and hand them to the shader. */
  update(dt: number): void {
    let w = 0;
    for (const l of this.lights) {
      l.life -= dt;
      if (l.life > 0) this.lights[w++] = l;
    }
    this.lights.length = w;
    const show = this.lights.slice(-MAX_LIGHTS);
    const data = this.lightData;
    const colors = this.colorData;
    for (let i = 0; i < show.length; i++) {
      const l = show[i];
      const t = l.life / l.maxLife;
      data[i * 4] = l.x / this.boardH; // board-height units, x scaled with the aspect in the shader
      data[i * 4 + 1] = l.y / this.boardH;
      data[i * 4 + 2] = l.radius / this.boardH;
      data[i * 4 + 3] = l.intensity * t;
      colors[i * 4] = l.r;
      colors[i * 4 + 1] = l.g;
      colors[i * 4 + 2] = l.b;
      colors[i * 4 + 3] = 1;
    }
    this.uniforms.uniforms.uLightCount = show.length;
    this.uniforms.update();
  }

  /** Draw the ground layers into the texture the mesh shows. */
  render(renderer: PixiRendererType, root: Container): void {
    renderer.render({ container: root, target: this.target, clear: true });
  }

  destroy(): void {
    // let go of the textures before they die, or Pixi warns about a source still bound to the shader
    const shader = this.mesh.shader;
    if (shader) {
      shader.resources.uTexture = Texture.EMPTY.source;
      shader.resources.uSampler = Texture.EMPTY.source.style;
      shader.resources.uNormal = Texture.EMPTY.source;
      shader.resources.uNormalSampler = Texture.EMPTY.source.style;
    }
    this.mesh.destroy();
    shader?.destroy();
    this.target.destroy(true);
  }
}

/** The sun: from the upper left, fairly high. Tangent space: x right, y down the board, z up. */
function sunDirection(): [number, number, number] {
  const v: [number, number, number] = [-0.45, -0.55, 0.7];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * The normal map for a map, built from the painting's brightness (fine grain) and the grid (the
 * trail's banks, the pads' plateaus, the edge), once per map id for the session. A painted normal
 * map could replace it (the shader does not care where the texture came from).
 */
const normalCache = new Map<string, Texture>();

export async function normalMapFor(ctx: SimContext, painting: Texture | null): Promise<Texture> {
  const id = ctx.map.id;
  const hit = normalCache.get(id);
  if (hit) return hit;
  const tex = buildNormalMap(ctx, painting);
  normalCache.set(id, tex);
  return tex;
}

function buildNormalMap(ctx: SimContext, painting: Texture | null): Texture {
  const cols = ctx.map.cols;
  const rows = ctx.map.rows;
  const W = 64 * cols; // 64 texels per tile is plenty for a lit backdrop
  const H = 64 * rows;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c2d = canvas.getContext('2d', { willReadFrequently: true })!;
  // the painting's brightness, blurred a touch by the downscale
  let lum: Float32Array | null = null;
  const res = painting?.source.resource as CanvasImageSource | undefined;
  if (res && typeof c2d.drawImage === 'function') {
    try {
      c2d.drawImage(res, 0, 0, W, H);
      const px = c2d.getImageData(0, 0, W, H).data;
      lum = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
    } catch {
      lum = null; // a cross-origin painting: relief only
    }
  }
  // relief: a height field on an 8-per-tile grid from the layout
  const S = 8;
  const gw = cols * S + 1;
  const gh = rows * S + 1;
  const trail: Array<[number, number]> = [];
  const pads: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const kind = ctx.map.legend[ctx.map.grid[r][c]];
      if (kind === 'path' || kind === 'spawn' || kind === 'exit') trail.push([c + 0.5, r + 0.5]);
      else if (kind === 'pad') pads.push([c + 0.5, r + 0.5]);
    }
  const height = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i / S;
      const y = j / S;
      // distance to the nearest trail cell's square (half-width 0.45): 0 inside, growing outside
      let dTrail = 9;
      for (const [tx, ty] of trail) {
        const dx = Math.max(0, Math.abs(x - tx) - 0.45);
        const dy = Math.max(0, Math.abs(y - ty) - 0.45);
        const d = Math.hypot(dx, dy);
        if (d < dTrail) dTrail = d;
      }
      const tm = 1 - Math.min(1, dTrail / 0.45); // 1 on the trail, 0 half a tile beyond its edge
      let dPad = 9;
      for (const [px, py] of pads) {
        const d = Math.hypot(x - px, y - py);
        if (d < dPad) dPad = d;
      }
      const pm = 1 - Math.min(1, Math.max(0, dPad - 0.3) / 0.15);
      const ground = 0.3 + 0.1 * (noise(x * 1.9, y * 1.9) - 0.5) + 0.05 * (noise(x * 5.3 + 7, y * 5.3) - 0.5);
      let h = ground * (1 - tm);
      h = h * (1 - pm) + Math.max(h, 0.36) * pm;
      const edge = Math.min(x, y, cols - x, rows - y);
      if (edge < 0.35) h -= ((0.35 - edge) / 0.35) * 0.5;
      height[j * gw + i] = h;
    }
  }
  const K = 2.4; // slope gain: a 0.3-tile bank over 0.45 tiles reads as a bank
  const out = c2d.createImageData(W, H);
  const d = out.data;
  const hAt = (gx: number, gy: number) => height[Math.min(gh - 1, Math.max(0, gy)) * gw + Math.min(gw - 1, Math.max(0, gx))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // relief normal, from the height field sampled at this texel (gradient in tile units)
      const gx = (x / W) * cols * S;
      const gy = (y / H) * rows * S;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const dhx = (hAt(ix + 1, iy) - hAt(ix - 1, iy)) * (S / 2);
      const dhy = (hAt(ix, iy + 1) - hAt(ix, iy - 1)) * (S / 2);
      let nx = -dhx * K;
      let ny = -dhy * K;
      let nz = 1;
      // fine grain from the painting (a 3-tap gradient), blended in
      if (lum) {
        const l = (xx: number, yy: number) => lum![Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
        const fx = (l(x + 1, y) - l(x - 1, y)) * 2.2;
        const fy = (l(x, y + 1) - l(x, y - 1)) * 2.2;
        nx += -fx;
        ny += -fy;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * W + x) * 4;
      d[o] = Math.round((nx * 0.5 + 0.5) * 255);
      d[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[o + 3] = 255;
    }
  }
  c2d.putImageData(out, 0, 0);
  return Texture.from(canvas);
}

/** Smooth value noise in [0, 1], for the ground's gentle unevenness. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const dd = h(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + dd * u) * v;
}

