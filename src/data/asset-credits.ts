export type AssetCredit = {
  id: string;
  src: string;
  title: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  changes: string;
  requiredAttribution?: string;
};

const changes =
  "Resized and JPEG re-encoded by Shopthie. Responsive display may crop the image; optimized derivatives retain the source image license.";

export const assetCredits: AssetCredit[] = [
  {
    id: "airpods-max-hero",
    src: "/images/products/hero-apple-airpods-max.jpg",
    title: "Apple AirPods Max 3.jpg",
    author: "SimonWaldherr",
    source: "https://commons.wikimedia.org/wiki/File:Apple_AirPods_Max_3.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
  {
    id: "airpods-max-detail",
    src: "/images/products/apple-airpods-max-detail.jpg",
    title: "Apple AirPods Max 2.jpg",
    author: "SimonWaldherr",
    source: "https://commons.wikimedia.org/wiki/File:Apple_AirPods_Max_2.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
  {
    id: "quietcomfort-25",
    src: "/images/products/bose-quietcomfort-25.jpg",
    title: "Bose QuietComfort 25 Acoustic Noise Cancelling Headphones.jpg",
    author: "Florian Fuchs",
    source:
      "https://commons.wikimedia.org/wiki/File:Bose_QuietComfort_25_Acoustic_Noise_Cancelling_Headphones.jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    changes,
    requiredAttribution: "Florian Fuchs/Wikipedia/CC-BY-SA 3.0",
  },
  {
    id: "airpods-pro",
    src: "/images/products/apple-airpods-pro-2nd-gen.jpg",
    title: "AirPods Pro (2nd generation).jpg",
    author: "Hajoon0102",
    source: "https://commons.wikimedia.org/wiki/File:AirPods_Pro_(2nd_generation).jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
  {
    id: "pixel-8",
    src: "/images/products/google-pixel-8-rose.jpg",
    title: "Google Pixel 8 Rose rear top-right.jpg",
    author: "IXTA9839",
    source: "https://commons.wikimedia.org/wiki/File:Google_Pixel_8_Rose_rear_top-right.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
  {
    id: "iphone-15",
    src: "/images/products/apple-iphone-15.jpg",
    title: "Back of iPhone 15.jpg",
    author: "ThePhotoGraphIc",
    source: "https://commons.wikimedia.org/wiki/File:Back_of_iPhone_15.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
  {
    id: "jbl-flip-3",
    src: "/images/products/jbl-flip-3.jpg",
    title: "JBL Flip 3 bluetooth speaker (DSCF2653).jpg",
    author: "Trougnouf",
    source: "https://commons.wikimedia.org/wiki/File:JBL_Flip_3_bluetooth_speaker_(DSCF2653).jpg",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    changes,
  },
  {
    id: "sonos-play-1",
    src: "/images/products/sonos-play-1.jpg",
    title: "Sonos PLAY 1 wireless speaker (cropped).jpg",
    author: "Robert Wetzlmayr",
    source: "https://commons.wikimedia.org/wiki/File:Sonos_PLAY_1_wireless_speaker_(cropped).jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes,
  },
];
