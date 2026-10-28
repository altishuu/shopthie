"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { categoryDefinitions, products } from "@/data/products";
import { filterProducts } from "@/lib/catalog";
import { gsap, Flip, useGSAP, motion } from "@/lib/gsap";
import { ProductCard } from "@/components/catalog/product-card";

function SearchForm({
  initialValue,
  onSearch,
}: {
  initialValue: string;
  onSearch: (query: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value.trim());
  };
  return (
    <form role="search" aria-label="Product search" className="catalog-search" onSubmit={submit}>
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        aria-label="Search products"
        placeholder="Find your next everyday favorite"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
}

export function Catalog({ initialCategory = "all" }: { initialCategory?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const scope = useRef<HTMLDivElement>(null);
  const layout = useRef<ReturnType<typeof Flip.from> | null>(null);
  const snapshot = useRef<{
    state: ReturnType<typeof Flip.getState> | null;
    cards: HTMLElement[];
    query: string;
  } | null>(null);
  const motionAllowed = useRef(false);
  const queryKey = searchParams.toString();
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || initialCategory;
  const brand = searchParams.get("brand") || "all";
  const sort = searchParams.get("sort") || "featured";
  const result = filterProducts(products, { query, category, brand, sort });
  const brands = [...new Set(products.map((product) => product.brand))].sort();
  const active = query || category !== "all" || brand !== "all" || sort !== "featured";

  useGSAP(
    () => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const reset = () => {
        motionAllowed.current = !media.matches;
        snapshot.current = null;
        // Completing Flip restores its measured inline styles, including dimensions.
        layout.current?.progress(1).kill();
        layout.current = null;
      };
      reset();
      media.addEventListener("change", reset);
      return () => {
        media.removeEventListener("change", reset);
        reset();
      };
    },
    { scope },
  );

  useGSAP(
    () => {
      const previous = snapshot.current;
      if (!previous || previous.query !== queryKey) return;
      snapshot.current = null;
      if (!motionAllowed.current) return;
      const cards = [
        ...(scope.current?.querySelectorAll<HTMLElement>("[data-product-card]") || []),
      ];
      // Flip explains moves of retained cards; new categories also need an entrance.
      const retained = cards.filter((card) => previous.cards.includes(card));
      const entering = cards.filter((card) => !previous.cards.includes(card));
      layout.current?.progress(1).kill();
      const transition = gsap.timeline();
      layout.current = transition;
      if (retained.length && previous.state) {
        transition.add(
          Flip.from(previous.state, {
            targets: retained,
            duration: motion.duration.layout,
            ease: motion.ease.control,
            prune: true,
            scale: false,
          }),
          0,
        );
      }
      if (entering.length) {
        transition.fromTo(
          entering,
          { y: 24, scale: 0.985, transformOrigin: "50% 0%" },
          {
            y: 0,
            scale: 1,
            duration: motion.duration.catalogEnter,
            stagger: motion.stagger.details,
            ease: motion.ease.enter,
            clearProps: "transform,transformOrigin",
          },
          0,
        );
        // Mask images only: labels and interactive overlays retain their contrast.
        const images = entering.flatMap((card) => [
          ...card.querySelectorAll(".product-card-visual img"),
        ]);
        if (images.length)
          transition.fromTo(
            images,
            { clipPath: "inset(0 0 8% 0)" },
            {
              clipPath: "inset(0 0 0% 0)",
              duration: motion.duration.catalogEnter,
              stagger: motion.stagger.details,
              ease: motion.ease.enter,
              clearProps: "clipPath",
            },
            0,
          );
      }
    },
    { scope, dependencies: [queryKey, pathname, initialCategory], revertOnUpdate: true },
  );

  const captureLayout = (nextQuery: string) => {
    snapshot.current = null;
    layout.current?.progress(1).kill();
    layout.current = null;
    if (!motionAllowed.current || nextQuery === queryKey) return;
    const cards = [...(scope.current?.querySelectorAll<HTMLElement>("[data-product-card]") || [])];
    snapshot.current = {
      state: cards.length ? Flip.getState(cards) : null,
      cards,
      query: nextQuery,
    };
  };

  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    captureLayout(params.toString());
    startTransition(() =>
      router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }),
    );
  };
  const clear = () => {
    captureLayout(pathname === "/shop" ? "" : "category=all");
    startTransition(() =>
      router.push(pathname === "/shop" ? "/shop" : `${pathname}?category=all`, { scroll: false }),
    );
  };

  return (
    <div ref={scope} className="catalog" aria-busy={pending}>
      <SearchForm key={query} initialValue={query} onSearch={(value) => update({ q: value })} />
      <div className="category-chips" aria-label="Product categories">
        {[{ slug: "all", label: "All products" }, ...categoryDefinitions].map((item) => (
          <button
            type="button"
            key={item.slug}
            aria-pressed={category === item.slug}
            onClick={() => update({ category: item.slug })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="catalog-toolbar">
        <p className="result-count" role="status" aria-live="polite">
          {result.length} {result.length === 1 ? "product" : "products"}
          {query ? ` for “${query}”` : " in the edit"}
        </p>
        <div className="catalog-controls">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <label>
            <span className="visually-hidden">Filter by brand</span>
            <select
              aria-label="Filter by brand"
              value={brand}
              onChange={(event) => update({ brand: event.currentTarget.value })}
            >
              <option value="all">All brands</option>
              {brands.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Sort products</span>
            <select
              aria-label="Sort products"
              value={sort}
              onChange={(event) => update({ sort: event.currentTarget.value })}
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </label>
        </div>
      </div>
      {active && result.length > 0 && (
        <button className="clear-filters" onClick={clear}>
          <X size={14} aria-hidden="true" />
          Clear filters
        </button>
      )}
      {result.length ? (
        <div className="product-grid">
          {result.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Nothing here. Yet.</h2>
          <p>Try another search or let the whole collection back in.</p>
          <button className="pill-link" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
