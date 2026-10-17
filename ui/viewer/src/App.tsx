/**
 * The app: the viewer, which reads a `.trajs` file and shows the sessions it
 * holds. The components it reads one with are shown in `ui/gallery`, beside the
 * tokens they are painted with, rather than in a second page of their own here.
 */

import { Viewer } from "@/components/viewer/viewer";

export function App() {
  return <Viewer />;
}
