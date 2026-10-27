"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, Menu, ShoppingBag, X } from "lucide-react";
import { cartCount } from "@/lib/cart";
import { useCommerce } from "@/providers/commerce-provider";

const navigation = [
  { href: "/shop", label: "Shop" },
  { href: "/collections/headphones", label: "Audio" },
  { href: "/about", label: "Our perspective" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const { state, ready, openCart } = useCommerce();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const media = window.matchMedia("(min-width: 761px)");
    const onResize = () => {
      if (media.matches) setOpen(false);
    };
    const onBack = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onBack);
    media.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onBack);
      media.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link
          href="/"
          className="wordmark"
          aria-label="Shopthie home"
          onClick={() => setOpen(false)}
        >
          shopthie<span aria-hidden="true">.</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-tools">
          <Link className="icon-button header-wishlist" href="/wishlist" aria-label="Wishlist">
            <Heart size={18} aria-hidden="true" />
            <span className="visually-hidden">{state.wishlist.length} saved products</span>
          </Link>
          <button
            className="bag-button"
            aria-label="Open bag"
            aria-describedby="bag-count"
            disabled={!ready}
            onClick={() => {
              setOpen(false);
              openCart();
            }}
          >
            <ShoppingBag size={17} aria-hidden="true" />
            <span className="bag-label">Bag</span>
            <span aria-hidden="true">{cartCount(state.cart)}</span>
          </button>
          <span id="bag-count" className="visually-hidden">
            {cartCount(state.cart)} items in your demo bag
          </span>
          <button
            ref={toggle}
            className="mobile-nav-toggle"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        className="mobile-nav"
        hidden={!open}
      >
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
            <ArrowUpRight size={22} aria-hidden="true" />
          </Link>
        ))}
        <Link href="/wishlist" onClick={() => setOpen(false)}>
          Wishlist
          <Heart size={20} aria-hidden="true" />
        </Link>
        <Link href="/#credits" onClick={() => setOpen(false)}>
          Image credits
          <ArrowUpRight size={22} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
