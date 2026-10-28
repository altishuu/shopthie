/** Critical, server-delivered first-paint cover; no bootstrap script or DOM mutation. */
export const BOOT_VEIL_ANIMATION = "shopthie-boot-release";
export const BOOT_VEIL_TIMEOUT_MS = 5000;

export const bootVeilCss = `
@media (prefers-reduced-motion: no-preference) {
  html:not([data-intro-state]) body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 95;
    background: #20231f;
    visibility: visible;
    pointer-events: auto;
    animation: ${BOOT_VEIL_ANIMATION} 0s ${BOOT_VEIL_TIMEOUT_MS}ms forwards;
  }
  html:not([data-intro-state]) #experience {
    visibility: hidden;
    animation: shopthie-boot-content-release 0s ${BOOT_VEIL_TIMEOUT_MS}ms forwards;
  }
}
@keyframes ${BOOT_VEIL_ANIMATION} {
  to { visibility: hidden; pointer-events: none; }
}
@keyframes shopthie-boot-content-release {
  to { visibility: visible; }
}
`;

// Static trusted markup: head/noscript treats this as a stylesheet with JS disabled.
export const noScriptBootFallback = {
  __html:
    "<style>body::before{display:none!important}#experience{visibility:visible!important;animation:none!important}</style>",
};
