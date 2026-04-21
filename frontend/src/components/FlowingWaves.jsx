import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Three.js flowing-waves shader background.
 * Adapted to use BayAlert's palette (deep navy + cyan caustics)
 * and tuned for slower, calmer water-like motion.
 */
export default function FlowingWaves({ intensity = 1.0, speed = 0.5, monochrome = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
    } catch (err) {
      console.error("WebGL not supported", err);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const vertexShader = `
      varying vec2 vTextureCoord;
      void main() {
        vTextureCoord = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // near-black base with random flowing ribbons of water (domain-warped fbm)
    const fragmentShader = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform float iIntensity;
      uniform float iSpeed;
      uniform bool iMonochrome;
      varying vec2 vTextureCoord;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);
        float t = iTime * iSpeed;

        // two levels of domain warping give the ribbons a random, flowing shape
        vec2 q = vec2(
          fbm(uv * 1.2 + vec2(0.0, t * 0.25)),
          fbm(uv * 1.2 + vec2(5.2, 1.3) - t * 0.18)
        );
        vec2 r = vec2(
          fbm(uv + 3.5 * q + vec2(1.7, 9.2) + t * 0.12),
          fbm(uv + 3.5 * q + vec2(8.3, 2.8) - t * 0.12)
        );
        float f = fbm(uv + 4.0 * r);

        // thin ribbon (band between two thresholds) + soft crest highlights
        float streak    = smoothstep(0.38, 0.55, f) * (1.0 - smoothstep(0.55, 0.78, f));
        float crestMask = pow(max(0.0, f - 0.62), 1.8);
        float haze      = pow(max(0.0, f - 0.35), 2.0) * 0.35;

        vec3 bg, streakColor, crest;
        if (iMonochrome) {
          bg          = vec3(0.0);
          streakColor = vec3(0.45);
          crest       = vec3(0.90);
        } else {
          bg          = vec3(0.0, 0.005, 0.015);
          streakColor = vec3(0.08, 0.55, 0.80);
          crest       = vec3(0.55, 0.95, 1.00);
        }

        vec3 col = bg;
        col = mix(col, streakColor, haze);
        col = mix(col, streakColor * 1.1, streak * 0.85);
        col = mix(col, crest, crestMask * 0.9);

        col *= iIntensity;
        fragColor = vec4(col, 1.0);
      }

      void main() {
        vec4 color;
        mainImage(color, vTextureCoord * iResolution);
        gl_FragColor = color;
      }
    `;

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      iIntensity: { value: intensity },
      iSpeed: { value: speed },
      iMonochrome: { value: monochrome },
    };

    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      uniforms.iResolution.value.set(w, h);
    }

    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    onResize();

    renderer.setAnimationLoop(() => {
      uniforms.iTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    });

    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      const canvas = renderer.domElement;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      material.dispose();
      geometry.dispose();
      renderer.dispose();
    };
  }, [intensity, speed, monochrome]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      {/* canvas appended by Three.js — force it to fill via CSS */}
      <style>{`
        .hero-water canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
      `}</style>
    </div>
  );
}
