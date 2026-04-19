import { useEffect, useRef } from "react";

/**
 * Animated WebGL water background.
 * Slow, rhythmic wave-like noise tinted with deep ocean blues.
 * Adapted from a generic smoke shader, retuned for water feel.
 */

const fragmentShaderSource = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
uniform vec3 u_deep;     // deep water color
uniform vec3 u_shallow;  // highlight / caustic color

#define FC gl_FragCoord.xy
#define R resolution
#define T (time + 660.)

float rnd(vec2 p) {
  p = fract(p * vec2(12.9898, 78.233));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(rnd(i), rnd(i + vec2(1, 0)), u.x),
    mix(rnd(i + vec2(0, 1)), rnd(i + 1.0), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float t = 0.0, a = 1.0;
  for (int i = 0; i < 5; i++) {
    t += a * noise(p);
    p *= mat2(1.0, -1.2, 0.2, 1.2) * 2.0;
    a *= 0.5;
  }
  return t;
}

void main() {
  vec2 uv = (FC - 0.5 * R) / R.y;
  uv *= vec2(1.6, 1.0);

  // slow horizontal flow + gentle vertical drift
  float flowX = T * 0.018;
  float flowY = T * 0.006;

  // wave-like distortion: sin waves modulating the noise sample point
  float wave = sin(uv.x * 2.0 + T * 0.25) * 0.06
             + sin(uv.y * 1.7 - T * 0.18) * 0.04;

  vec2 q = uv + vec2(flowX, flowY) + wave;
  float n = fbm(q * 0.9);
  n = noise(uv * 2.5 + n * 1.5);

  // build channels with slight per-channel offset for soft caustics
  float r = fbm(uv * 1.0 + vec2(flowX, 0.0) + n);
  float g = fbm(uv * 1.005 + vec2(flowX, 0.0) + n + 0.004);
  float b = fbm(uv * 1.01 + vec2(flowX, 0.0) + n + 0.008);

  vec3 base = vec3(r, g, b);

  // tint: deep at low values, shallow/caustic at highlights
  float intensity = dot(base, vec3(0.21, 0.71, 0.07));
  vec3 col = mix(u_deep, u_shallow, smoothstep(0.35, 0.85, intensity));

  // subtle vignette darkening at edges
  float dist = length(uv * 0.6);
  col *= smoothstep(1.4, 0.2, dist);

  // fade-in on first second
  col = mix(u_deep * 0.6, col, min(time * 0.3, 1.0));

  O = vec4(col, 1.0);
}`;

const vertexShaderSource = `#version 300 es
precision highp float;
in vec4 position;
void main() { gl_Position = position; }`;

class WaterRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2");
    this.deep = [0.039, 0.086, 0.157];     // #0a1628 — matches hero bg
    this.shallow = [0.133, 0.827, 0.933];  // #22d3ee — accent cyan
    this.program = null;
    this.vs = null;
    this.fs = null;
    this.buffer = null;
    this.uniforms = {};
    if (!this.gl) return;
    this.setup();
    this.init();
  }

  updateColors(deep, shallow) {
    this.deep = deep;
    this.shallow = shallow;
  }

  updateScale() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  compile(shader, source) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("shader error:", gl.getShaderInfoLog(shader));
    }
  }

  setup() {
    const gl = this.gl;
    this.vs = gl.createShader(gl.VERTEX_SHADER);
    this.fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!this.vs || !this.fs || !program) return;
    this.compile(this.vs, vertexShaderSource);
    this.compile(this.fs, fragmentShaderSource);
    this.program = program;
    gl.attachShader(program, this.vs);
    gl.attachShader(program, this.fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("link error:", gl.getProgramInfoLog(program));
    }
  }

  init() {
    const { gl, program } = this;
    if (!program) return;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = {
      resolution: gl.getUniformLocation(program, "resolution"),
      time: gl.getUniformLocation(program, "time"),
      deep: gl.getUniformLocation(program, "u_deep"),
      shallow: gl.getUniformLocation(program, "u_shallow"),
    };
  }

  render(now = 0) {
    const { gl, program, buffer, canvas, uniforms } = this;
    if (!program || !gl.isProgram(program)) return;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, now * 1e-3);
    gl.uniform3fv(uniforms.deep, this.deep);
    gl.uniform3fv(uniforms.shallow, this.shallow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    const { gl, program, vs, fs } = this;
    if (!program) return;
    if (vs) { gl.detachShader(program, vs); gl.deleteShader(vs); }
    if (fs) { gl.detachShader(program, fs); gl.deleteShader(fs); }
    gl.deleteProgram(program);
    this.program = null;
  }
}

export default function WaterBackground({ deep, shallow, style }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const renderer = new WaterRenderer(canvas);
    rendererRef.current = renderer;

    const handleResize = () => renderer.updateScale();
    handleResize();
    window.addEventListener("resize", handleResize);

    let frame;
    const loop = (now) => {
      renderer.render(now);
      frame = requestAnimationFrame(loop);
    };
    loop(0);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frame);
      renderer.destroy();
    };
  }, []);

  useEffect(() => {
    const r = rendererRef.current;
    if (r && deep && shallow) r.updateColors(deep, shallow);
  }, [deep, shallow]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        ...style,
      }}
    />
  );
}
