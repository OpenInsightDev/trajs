/**
 * Where the landing page's links point.
 *
 * The navigation and the index are the ones the design draws, which name the
 * addresses the documentation is being rebuilt under (`content/index.mdx` says
 * so): `docs`, `examples`, `blog` and `changelog` are the site's own routes, and
 * the repository is the one address that answers today. They are kept here
 * rather than in the components so a route that lands later is one edit.
 */

/** A route of this site, under the base path the build is served at. */
const route = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

/** The site's home page, which is this landing page. */
export const homeUrl = route("");

export const docsUrl = route("docs");

export const examplesUrl = route("examples");

export const blogUrl = route("blog");

export const changelogUrl = route("changelog");

/** The source the site documents. */
export const repositoryUrl = "https://github.com/OpenInsightDev/trajs";

/** The navigation the floating header carries, in the order the design draws it. */
export type NavigationItem = Readonly<{
  label: string;
  href: string;
  /** Whether the link leaves the site. */
  external?: boolean;
}>;

export const navigation: readonly NavigationItem[] = [
  { label: "DOCS", href: docsUrl },
  { label: "EXAMPLES", href: examplesUrl },
  { label: "BLOG", href: blogUrl },
  { label: "CHANGELOG", href: changelogUrl },
  { label: "GITHUB", href: repositoryUrl, external: true },
];

/** One of the three entries the index under the hero lists. */
export type IndexEntry = Readonly<{
  label: string;
  description: string;
  action: string;
  href: string;
}>;

/** The index, named the way the design labels it. */
export const indexEntries: readonly IndexEntry[] = [
  {
    label: "RECORD",
    description: "Capture every thought, tool call and observation as a typed, timestamped step.",
    action: "DOCS",
    href: docsUrl,
  },
  {
    label: "ANALYSIS",
    description: "Replay any run, diff two trajectories, and profile tokens, latency and cost.",
    action: "EXAMPLES",
    href: examplesUrl,
  },
  {
    label: "EXCHANGE",
    description: "One portable file. Share a link, export to JSONL, or open it in any runtime.",
    action: "BLOG",
    href: blogUrl,
  },
];
