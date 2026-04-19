/**
 * Shimmer placeholder. Use to fill space while data loads.
 *
 *   <Skeleton width="100%" height={20} />
 *   <Skeleton.Card lines={3} />
 */
export default function Skeleton({
  width = "100%",
  height = 16,
  radius = 4,
  style,
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

Skeleton.Stack = function SkeletonStack({ lines = 3, gap = 8, lineHeight = 12 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={`${60 + Math.random() * 40}%`}
        />
      ))}
    </div>
  );
};
