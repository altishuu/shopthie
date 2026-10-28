import type { ReactNode } from "react";
import Link from "next/link";
import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import "@/app/identity.css";

export function IdentityShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="identity-page container" tabIndex={-1}>
      <div className="identity-layout">
        <aside className="identity-intro" aria-label="Shopthie accounts">
          <p className="eyebrow">Your Shopthie</p>
          <p className="identity-statement">
            A little space.
            <br />
            For your everyday.
          </p>
          <p className="identity-description">
            Thoughtfully chosen technology. A considered place to come back to.
          </p>
          <Link className="identity-text-link" href="/shop">
            Back to the edit
          </Link>
        </aside>
        <section className="identity-panel" aria-labelledby="identity-heading">
          {children}
        </section>
      </div>
      <RouteMotionReady />
    </main>
  );
}
