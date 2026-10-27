import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function EmptyState({
  title,
  description,
  action = "Explore the collection",
  href = "/shop",
  onNavigate,
}: {
  title: string;
  description: string;
  action?: string;
  href?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        s.
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="pill-link" href={href} onClick={onNavigate}>
        {action}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}
