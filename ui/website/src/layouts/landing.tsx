/**
 * The landing page's shell: the page draws its own floating header, so the home
 * layout is the page and nothing around it.
 *
 * Fumapress's own home layout puts a navbar and a centred column above the page,
 * which is the docs shell the design does not have; the provider and the body
 * the root layout draws still wrap this, so the page keeps the site's head, its
 * stylesheet and its theme script.
 */

import type { ReactNode } from "react";

export const LandingLayout = ({ children }: { children: ReactNode }) => children;
