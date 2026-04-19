import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Three.js flowing-waves shader background.
 * Adapted to use BayAlert's palette (deep navy + cyan caustics)
 * and tuned for slower, calmer water-like motion.
 */
export default function FlowingWaves({ intensity = 1.0, speed = 0.5 }) {
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

    // tuned for water: deep navy base + cyan highlights, slower motion
    const fragmentShader = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform float iIntensity;
      uniform float iSpeed;
      varying vec2 vTextureCoord;

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

        float t = iTime * iSpeed;

        for (float i = 1.0; i < 8.0; i++) {
          uv.x += 0.5 / i * cos(i * 2.0 * uv.y + t);
          uv.y += 0.5 / i * cos(i * 1.3 * uv.x + t);
        }

        // water palette: deep blue → cyan highlights
        vec3 deep = vec3(0.04, 0.10, 0.20);
        vec3 wave = vec3(0.05, 0.45, 0.65);
        vec3 highlight = vec3(0.15, 0.85, 0.95);

        float pulse = abs(sin(t - uv.y - uv.x));
        vec3 col = mix(deep, wave, smoothstep(0.05, 0.6, pulse));
        col = mix(col, highlight, smoothstep(0.85, 1.0, pulse) * 0.7);

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
  }, [intensity, speed]);

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
    />
  );
}
