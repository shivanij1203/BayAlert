import FlowingWaves from "./FlowingWaves";

/**
 * Subtle full-page water background. Sits fixed behind all content,
 * tinting through the translucent section backgrounds.
 */
export default function PageBackground() {
  return (
    <div className="page-bg" aria-hidden="true">
      <FlowingWaves intensity={0.95} speed={0.35} />
    </div>
  );
}
