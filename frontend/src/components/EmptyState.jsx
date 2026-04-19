/**
 * Generic empty/no-data state with optional icon and helper hint.
 */
export default function EmptyState({
  title = "No data available",
  hint,
  icon,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`} role="status">
      <div className="empty-icon">
        {icon || <DefaultEmptyIcon />}
      </div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

function DefaultEmptyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5-2 4-2 4 2 4 2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
