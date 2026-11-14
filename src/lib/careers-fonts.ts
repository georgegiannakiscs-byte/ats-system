import {
  Alegreya, Commissioner, EB_Garamond, Geologica, IBM_Plex_Sans, Inter, Literata, Manrope, Noto_Sans, Noto_Serif,
  Open_Sans, Piazzolla, Roboto, Roboto_Slab, Sofia_Sans, Source_Serif_4, Comfortaa,
} from "next/font/google";
import type { CareersFontKey } from "./careers-theme";

/*
 * Fonts a company can pick for its careers pages. All are self-hosted by next/font (no request to
 * Google from the visitor's browser) and all include Greek. preload is off: a page only downloads
 * the one or two families its company actually uses.
 */

const inter = Inter({ subsets: ["latin", "greek"], display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin", "greek"], display: "swap", preload: false });
const commissioner = Commissioner({ subsets: ["latin", "greek"], display: "swap", preload: false });
const plex = IBM_Plex_Sans({ subsets: ["latin", "greek"], display: "swap", preload: false });
const openSans = Open_Sans({ subsets: ["latin", "greek"], display: "swap", preload: false });
const roboto = Roboto({ subsets: ["latin", "greek"], display: "swap", preload: false });
const notoSans = Noto_Sans({ subsets: ["latin", "greek"], display: "swap", preload: false });
const sofia = Sofia_Sans({ subsets: ["latin", "greek"], display: "swap", preload: false });
const geologica = Geologica({ subsets: ["latin", "greek"], display: "swap", preload: false });
const comfortaa = Comfortaa({ subsets: ["latin", "greek"], display: "swap", preload: false });
const literata = Literata({ subsets: ["latin", "greek"], display: "swap", preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "greek"], display: "swap", preload: false });
const notoSerif = Noto_Serif({ subsets: ["latin", "greek"], display: "swap", preload: false });
const garamond = EB_Garamond({ subsets: ["latin", "greek"], display: "swap", preload: false });
const alegreya = Alegreya({ subsets: ["latin", "greek"], display: "swap", preload: false });
const robotoSlab = Roboto_Slab({ subsets: ["latin", "greek"], display: "swap", preload: false });
const piazzolla = Piazzolla({ subsets: ["latin", "greek"], display: "swap", preload: false });

const FAMILIES: Record<Exclude<CareersFontKey, "default">, string> = {
  inter: inter.style.fontFamily,
  manrope: manrope.style.fontFamily,
  commissioner: commissioner.style.fontFamily,
  "ibm-plex-sans": plex.style.fontFamily,
  "open-sans": openSans.style.fontFamily,
  roboto: roboto.style.fontFamily,
  "noto-sans": notoSans.style.fontFamily,
  "sofia-sans": sofia.style.fontFamily,
  geologica: geologica.style.fontFamily,
  comfortaa: comfortaa.style.fontFamily,
  literata: literata.style.fontFamily,
  "source-serif": sourceSerif.style.fontFamily,
  "noto-serif": notoSerif.style.fontFamily,
  "eb-garamond": garamond.style.fontFamily,
  alegreya: alegreya.style.fontFamily,
  "roboto-slab": robotoSlab.style.fontFamily,
  piazzolla: piazzolla.style.fontFamily,
};

/** CSS font-family value for a font key, or null for the Ulysse default. */
export function fontFamilyFor(key: CareersFontKey): string | null {
  return key === "default" ? null : FAMILIES[key];
}
