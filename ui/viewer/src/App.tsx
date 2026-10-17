/**
 * The app, as the two pages it has: the viewer, which reads a `.trajs` file and
 * shows the sessions it holds, and the gallery, which shows the components that
 * read a prompt and a response. The viewer is the page the app is; the gallery is
 * reached by the hash `#/components`, so a page that is read a lot is a page that
 * can be linked to.
 */

import { useEffect, useState } from "react";

import { Gallery } from "@/components/gallery";
import { Viewer } from "@/components/viewer/viewer";

const usePage = (): "viewer" | "components" => {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const update = () => setHash(window.location.hash);

    window.addEventListener("hashchange", update);

    return () => window.removeEventListener("hashchange", update);
  }, []);

  return hash.startsWith("#/components") ? "components" : "viewer";
};

export function App() {
  return usePage() === "components" ? <Gallery /> : <Viewer />;
}
