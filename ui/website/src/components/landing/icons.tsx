/**
 * The icons the landing page draws, as the design exports them: each path and
 * stroke width is the one on its node, and the stroke is `currentColor` so the
 * colour comes from the token the surrounding text uses.
 *
 * `Check` is the one exception: the design draws no copied state, so it is
 * stroked on the 16-unit grid the copy glyph is drawn on.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** `icon / record` (230:5): a typed step. */
export const RecordIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M17.25 10C17.25 14.0041 14.0041 17.25 10 17.25C5.99594 17.25 2.75 14.0041 2.75 10C2.75 5.99594 5.99594 2.75 10 2.75C14.0041 2.75 17.25 5.99594 17.25 10Z"
      stroke="currentColor"
      strokeWidth="1.25"
    />
    <path
      d="M10 12.75C11.5188 12.75 12.75 11.5188 12.75 10C12.75 8.48122 11.5188 7.25 10 7.25C8.48122 7.25 7.25 8.48122 7.25 10C7.25 11.5188 8.48122 12.75 10 12.75Z"
      fill="currentColor"
    />
  </svg>
);

/** `icon / analysis` (230:16): a run profiled. */
export const AnalysisIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M2.5 14.5L6.75 9L10.5 12L17 4.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
    />
    <path
      d="M17 6C17.8284 6 18.5 5.32843 18.5 4.5C18.5 3.67157 17.8284 3 17 3C16.1716 3 15.5 3.67157 15.5 4.5C15.5 5.32843 16.1716 6 17 6Z"
      fill="currentColor"
    />
  </svg>
);

/** `icon / exchange` (230:27): a portable file moving on. */
export const ExchangeIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M2.5 6.5H16.5M13.75 9.25L16.5 6.5L13.75 3.75"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
    />
    <path
      d="M17.5 13.5H3.5M6.25 16.25L3.5 13.5L6.25 10.75"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
    />
  </svg>
);

/** `arrow` (230:11): the 12-unit diagonal an index link ends in. */
export const ArrowUpRight = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M3.375 8.625L8.625 3.375M8.625 7.875V3.375H4.125"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.08"
    />
  </svg>
);

/** `arrow` (230:76): the 13-unit diagonal the header's GitHub link ends in. */
export const ArrowUpRightSmall = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 13 13" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M3.65625 9.34375L9.34375 3.65625M9.34375 8.53125V3.65625H4.46875"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.06364"
    />
  </svg>
);

/** `arrow` (230:49): the 17-unit arrow the two buttons carry. */
export const ArrowRight = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 17 17" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M2.65625 8.5H14.3438M10.0938 12.75L14.3438 8.5L10.0938 4.25"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.82143"
    />
  </svg>
);

/** `copy` (230:44): the glyph the install command copies with. */
export const CopyIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M7.60006 5.59976H11.5001C12.6046 5.59976 13.5001 6.49519 13.5001 7.59976V11.4998C13.5001 12.6043 12.6046 13.4998 11.5001 13.4998H7.60006C6.49549 13.4998 5.60006 12.6043 5.60006 11.4998V7.59976C5.60006 6.49519 6.49549 5.59976 7.60006 5.59976Z"
      stroke="currentColor"
      strokeWidth="1.47692"
    />
    <path
      d="M10.4 3.6V3.2C10.4 3.04241 10.369 2.88637 10.3087 2.74078C10.2484 2.59519 10.16 2.4629 10.0485 2.35147C9.9371 2.24004 9.80481 2.15165 9.65922 2.09134C9.51363 2.03104 9.35759 2 9.2 2H3.7C3.38174 2 3.07652 2.12643 2.85147 2.35147C2.62643 2.57652 2.5 2.88174 2.5 3.2V8.7C2.5 9.01826 2.62643 9.32348 2.85147 9.54853C3.07652 9.77357 3.38174 9.9 3.7 9.9H4.1"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.47692"
    />
  </svg>
);

/** The copy button's copied state, drawn on the copy glyph's 16-unit grid. */
export const CheckIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M3 8.5L6.25 11.75L13 5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.47692"
    />
  </svg>
);

/** `Sun` (230:80): the light segment of the theme control. */
export const SunIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="6" cy="6" r="2.1" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M6 0.7V1.95M6 10.05V11.3M0.7 6H1.95M10.05 6H11.3M2.26 2.26L3.13 3.13M9.74 2.26L8.87 3.13M2.26 9.74L3.13 8.87M9.74 9.74L8.87 8.87"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.2"
    />
  </svg>
);

/** `Moon` (230:83): the dark segment of the theme control, which is selected. */
export const MoonIcon = (props: IconProps) => (
  <svg aria-hidden fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M10.4697 6.93701C9.85399 7.73187 9.4873 8.72972 9.4873 9.81299C9.48741 12.4086 11.5918 14.5132 14.1875 14.5132C15.2709 14.5132 16.2676 14.1447 17.0625 13.5288C16.3678 15.5831 14.4265 17.0629 12.1377 17.063C9.26581 17.063 6.9375 14.7347 6.9375 11.8628C6.9375 9.57437 8.41605 7.63211 10.4697 6.93701Z"
      fill="currentColor"
    />
  </svg>
);
