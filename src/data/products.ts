import type { Product, ProductCategory } from "../types/product.ts";

export const categoryDefinitions: { slug: ProductCategory; label: string; description: string }[] =
  [
    {
      slug: "headphones",
      label: "Headphones",
      description: "Over-ear designs from our considered listening edit.",
    },
    {
      slug: "earbuds",
      label: "Earbuds",
      description: "Small-format listening for your everyday collection.",
    },
    {
      slug: "smartphones",
      label: "Smartphones",
      description: "Familiar phones with a place in your everyday carry.",
    },
    {
      slug: "speakers",
      label: "Speakers",
      description: "Home and portable designs for your listening spaces.",
    },
  ];

/** Editorial demo data. All prices and stock limits are simulated, not live offers. */
export const products: Product[] = [
  {
    id: "apple-airpods-max",
    slug: "apple-airpods-max",
    brand: "Apple",
    name: "AirPods Max",
    category: "headphones",
    description:
      "A sculptural over-ear silhouette for your listening corner. Explore two views of the photographed model in this demo collection. Mock USD price and stock; not a live offer.",
    priceMinor: 44900,
    currency: "USD",
    images: [
      {
        src: "/images/products/hero-apple-airpods-max.jpg",
        width: 1920,
        height: 1277,
        alt: "AirPods Max over-ear headphones, landscape view",
        creditId: "airpods-max-hero",
      },
      {
        src: "/images/products/apple-airpods-max-detail.jpg",
        width: 1599,
        height: 1600,
        alt: "AirPods Max over-ear headphones, detail view",
        creditId: "airpods-max-detail",
      },
    ],
    variants: [
      {
        id: "apple-airpods-max-photographed",
        label: "Photographed model",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: true,
    specificationSources: ["https://support.apple.com/en-ca/111858"],
    specifications: [
      {
        label: "Chip",
        value: "Apple H1 in each ear cup",
      },
      {
        label: "Noise control",
        value: "Active Noise Cancellation and Transparency mode",
      },
    ],
  },
  {
    id: "bose-quietcomfort-25",
    slug: "bose-quietcomfort-25",
    brand: "Bose",
    name: "QuietComfort 25",
    category: "headphones",
    description:
      "A familiar travel companion, shown with its cable and rounded ear cups. An archival design chosen for our listening edit. Mock USD price and stock; not a live offer.",
    priceMinor: 15900,
    currency: "USD",
    images: [
      {
        src: "/images/products/bose-quietcomfort-25.jpg",
        width: 1600,
        height: 1200,
        alt: "Bose QuietComfort 25 headphones with cable",
        creditId: "quietcomfort-25",
      },
    ],
    variants: [
      {
        id: "bose-quietcomfort-25-photographed",
        label: "Photographed model",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: false,
    specificationSources: [
      "https://support.bose.com/s/product/quietcomfort-25-acoustic-noise-cancelling-headphones/01t8c00000OydKfAAJ?language=en_US",
      "https://bose.com/pressroom/bose-quietcomfort-25-acoustic-noise-cancelling-headphones",
    ],
    specifications: [
      {
        label: "Noise control",
        value: "Acoustic Noise Cancelling",
      },
      {
        label: "Battery",
        value: "One AAA battery",
      },
    ],
  },
  {
    id: "apple-airpods-pro-2nd-gen",
    slug: "apple-airpods-pro-2nd-gen",
    brand: "Apple",
    name: "AirPods Pro (2nd generation)",
    category: "earbuds",
    description:
      "Small in the frame, considered in the details. This listening edit presents the photographed earbuds beside their case. Mock USD price and stock; not a live offer.",
    priceMinor: 19900,
    currency: "USD",
    images: [
      {
        src: "/images/products/apple-airpods-pro-2nd-gen.jpg",
        width: 1600,
        height: 1200,
        alt: "AirPods Pro (2nd generation) earbuds beside their charging case",
        creditId: "airpods-pro",
      },
    ],
    variants: [
      {
        id: "apple-airpods-pro-2nd-gen-photographed",
        label: "Photographed model",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: true,
    specificationSources: ["https://support.apple.com/en-us/111851"],
    specifications: [
      {
        label: "Chip",
        value: "Apple H2",
      },
      {
        label: "Noise control",
        value: "Active Noise Cancellation",
      },
    ],
  },
  {
    id: "google-pixel-8",
    slug: "google-pixel-8",
    brand: "Google",
    name: "Pixel 8",
    category: "smartphones",
    description:
      "Rose brings a softer note to the everyday carry. Explore the photographed Pixel 8 with a choice of demo storage selections. Mock USD price and stock; not a live offer.",
    priceMinor: 54900,
    currency: "USD",
    images: [
      {
        src: "/images/products/google-pixel-8-rose.jpg",
        width: 1600,
        height: 1067,
        alt: "Google Pixel 8 in Rose, rear three-quarter view",
        creditId: "pixel-8",
      },
    ],
    variants: [
      {
        id: "google-pixel-8-128gb",
        label: "128 GB",
        imageIndex: 0,
        demoStock: 5,
      },
      {
        id: "google-pixel-8-256gb",
        label: "256 GB",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: true,
    specificationSources: ["https://support.google.com/pixelphone/answer/7158570?hl=en"],
    specifications: [
      {
        label: "Processor",
        value: "Google Tensor G3",
      },
      {
        label: "Storage options",
        value: "128 GB / 256 GB",
      },
    ],
  },
  {
    id: "apple-iphone-15",
    slug: "apple-iphone-15",
    brand: "Apple",
    name: "iPhone 15",
    category: "smartphones",
    description:
      "A straightforward addition to the everyday edit. Compare storage selections while the gallery retains the same photographed finish. Mock USD price and stock; not a live offer.",
    priceMinor: 64900,
    currency: "USD",
    images: [
      {
        src: "/images/products/apple-iphone-15.jpg",
        width: 1200,
        height: 1600,
        alt: "Apple iPhone 15, rear view of photographed finish",
        creditId: "iphone-15",
      },
    ],
    variants: [
      {
        id: "apple-iphone-15-128gb",
        label: "128 GB",
        imageIndex: 0,
        demoStock: 5,
      },
      {
        id: "apple-iphone-15-256gb",
        label: "256 GB",
        imageIndex: 0,
        demoStock: 5,
      },
      {
        id: "apple-iphone-15-512gb",
        label: "512 GB",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: false,
    specificationSources: ["https://support.apple.com/en-us/111831"],
    specifications: [
      {
        label: "Chip",
        value: "A16 Bionic",
      },
      {
        label: "Storage options",
        value: "128 GB / 256 GB / 512 GB",
      },
    ],
  },
  {
    id: "jbl-flip-3",
    slug: "jbl-flip-3",
    brand: "JBL",
    name: "Flip 3",
    category: "speakers",
    description:
      "A compact cylinder with a place on the weekend shelf. This photographed Flip 3 adds a casual note to the speaker collection. Mock USD price and stock; not a live offer.",
    priceMinor: 7900,
    currency: "USD",
    images: [
      {
        src: "/images/products/jbl-flip-3.jpg",
        width: 1600,
        height: 842,
        alt: "JBL Flip 3 speaker resting on wood",
        creditId: "jbl-flip-3",
      },
    ],
    variants: [
      {
        id: "jbl-flip-3-photographed",
        label: "Photographed model",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: false,
    specificationSources: [
      "https://support.jbl.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dwbece8b7e/pdfs/JBL%20FLIP%203_SpecSheet_EN_Final_20%20May.pdf",
    ],
    specifications: [
      {
        label: "Bluetooth",
        value: "4.1",
      },
      {
        label: "Output power",
        value: "2 × 8 W",
      },
    ],
  },
  {
    id: "sonos-play-1",
    slug: "sonos-play-1",
    brand: "Sonos",
    name: "PLAY:1",
    category: "speakers",
    description:
      "A quiet visual presence for a favorite shelf. The photographed PLAY:1 joins our home-listening edit with a simple, familiar profile. Mock USD price and stock; not a live offer.",
    priceMinor: 14900,
    currency: "USD",
    images: [
      {
        src: "/images/products/sonos-play-1.jpg",
        width: 1380,
        height: 1600,
        alt: "Sonos PLAY:1 speaker on a wooden surface",
        creditId: "sonos-play-1",
      },
    ],
    variants: [
      {
        id: "sonos-play-1-photographed",
        label: "Photographed model",
        imageIndex: 0,
        demoStock: 5,
      },
    ],
    featured: true,
    specificationSources: ["https://www.sonos.com/pdfs/productguides/en-us/play1guide.pdf"],
    specifications: [
      {
        label: "Amplification",
        value: "Two Class-D digital amplifiers",
      },
      {
        label: "Ethernet",
        value: "One 10/100 Mbps port",
      },
    ],
  },
];
