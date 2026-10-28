"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { gsap, motion } from "@/lib/gsap";

function focusIfAvailable(element: Element | null): boolean {
  if (
    !(element instanceof HTMLElement) ||
    !element.isConnected ||
    element === document.body ||
    element === document.documentElement ||
    element.matches(":disabled") ||
    element.closest(
      '[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"], dialog:not([open])',
    ) ||
    !element.getClientRects().length
  )
    return false;
  const visibility = getComputedStyle(element).visibility;
  if (visibility === "hidden" || visibility === "collapse") return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

export function Dialog({
  title,
  children,
  onClose,
  drawer = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const purchaseContext = opener?.closest<HTMLElement>(".product-options, #product-purchase");
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let entrance: gsap.core.Tween | undefined;
    const reset = () => {
      entrance?.kill();
      gsap.set(dialog, { clearProps: "transform" });
    };
    if (!media.matches) {
      entrance = gsap.fromTo(dialog, drawer ? { x: 20 } : { y: 10, scale: 0.99 }, {
        x: 0,
        y: 0,
        scale: 1,
        duration: motion.duration.surface,
        ease: motion.ease.control,
        overwrite: true,
        clearProps: "transform",
      });
    }
    media.addEventListener("change", reset);
    return () => {
      media.removeEventListener("change", reset);
      reset();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (focusIfAvailable(opener)) return;

      // Buying the final stock can disable (and blur) the trigger before this
      // effect captures it. Prefer its purchase context, then the visible page.
      const contexts = new Set([
        purchaseContext,
        ...document.querySelectorAll<HTMLElement>("#product-purchase"),
      ]);
      for (const context of contexts) {
        if (!context) continue;
        for (const control of context.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        )) {
          if (focusIfAvailable(control)) return;
        }
        if (focusIfAvailable(context)) return;
      }
      for (const main of document.querySelectorAll<HTMLElement>("main")) {
        if (focusIfAvailable(main)) return;
      }
    };
  }, [drawer]);

  return (
    <dialog
      ref={ref}
      className={`shop-dialog ${drawer ? "drawer-dialog" : "quick-dialog"}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const controls = [
          ...dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter(
          (element) =>
            element.tabIndex >= 0 &&
            element.getClientRects().length > 0 &&
            !element.closest("[inert]"),
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.querySelector<HTMLElement>("h2")?.focus();
          return;
        }
        const active = document.activeElement;
        const focusOnControl = active instanceof HTMLElement && controls.includes(active);
        if (event.shiftKey && (active === first || !focusOnControl)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-top">
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        <button
          className="icon-button"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
