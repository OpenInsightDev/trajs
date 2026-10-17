/**
 * The trajs mark, as the two components that draw it: {@link Icon}, the mark
 * alone, and {@link Logo}, the same mark with the wordmark beside it.
 *
 * They are held as components rather than shipped as `.svg` files because a mark
 * is drawn at the colour and the size of the place it is read in, and what it
 * looks like there is said with the classes an `svg` is styled with rather than
 * with props of this package's own: `stroke-*` is the weight and the colour of
 * the mark, `fill-*` the colour of the letters, `text-*` both, and `h-*`/`w-*`
 * the size. Each is a default in the markup — `stroke="currentColor"`,
 * `strokeWidth={markWeight}` — that a class overrides, so nothing has to be asked
 * for twice. What a class cannot decide is the drawing: the paths, the weight
 * they default to, the gap between the mark and the letters, and the boxes they
 * sit in.
 *
 * The logo is the icon with the letters set beside it, so the mark is one path
 * held once, and the two components frame it in boxes of the same height: the
 * mark is drawn the same size in both, and one edit to it is both of them.
 *
 * The paths are the ones the mark was exported as, brought to a form a person
 * can read and edit: absolute commands, one command to a line starting in the
 * first column, and every coordinate rounded to two decimals — a hundredth of a
 * unit, which is a fraction of a pixel at any size a mark is read at. The
 * wordmark is held as the five letters it is made of, so that a letter can be
 * found rather than searched for.
 */

import type { ComponentProps } from "react";

/**
 * The mark, in the box both components draw it in: the icon's 92 × 146, which the
 * logo extends to the right with the letters. The mark itself sits between
 * `(2.35, 2.34)` and `(89.58, 143.48)`.
 *
 * It is a rectangle whose left edge is broken at `(2.35, 72.91)` and whose right
 * edge is broken at `(89.58, 89.57)`, with the diagonals that cross it: one runs
 * from the right break to the top-left corner, and three more — from the two
 * breaks and the bottom-left corner — meet at `(45.97, 116.53)`.
 */
const mark = `M 2.35 72.91
L 2.35 2.34
L 89.58 2.34
L 89.58 89.57
M 2.35 72.91
L 2.35 143.48
L 89.58 143.48
L 89.58 89.57
M 89.58 89.57
L 2.35 2.34
M 89.58 89.57
L 45.97 116.53
M 2.35 143.48
L 45.97 116.53
M 2.35 72.91
L 45.97 116.53`;

/**
 * The weight the mark is stroked at when nothing asks for another: heavier than
 * the 2.06721 it was exported at, which is a hairline at the sizes a mark is read
 * at, and inside the frame's own limit — the mark sits 2.34 units into its 146,
 * so a stroke runs out of it at about 4.6.
 *
 * It sits on the `svg` rather than on the path for the reason the colour does: a
 * `stroke-*` class can only take it away from the element the declaration is on,
 * and the path inherits what is left of it.
 */
const markWeight = 3;

/**
 * The wordmark, as the letters it is made of, in the order they are read. The
 * five are set between y 72 and y 105 together, starting 13.96 to the right of
 * the mark.
 *
 * They are IBM Plex Sans — `IBMPlexSansVar-Roman.ttf` at `wght 250`, on a
 * baseline at y 104.93, at an em of 45.93 units and +0.0802 em of tracking.
 * Another weight of the name is therefore set again in that font rather than
 * drawn: with the font's own kerning, the placement of every letter here agrees
 * with the font to 0.03 units, and the ink the five cover to 0.2%.
 */
const letterT = `M 127.75 74.84
H 116.77
V 104.93
H 114.52
V 74.84
H 103.54
V 72.87
H 127.75
V 74.84
Z`;

const letterR = `M 139.21 90.55
V 104.93
H 137
V 72.87
H 149.5
C 151.3 72.87 152.82 73.22 154.04 73.92
C 155.3 74.63 156.25 75.64 156.89 76.96
C 157.57 78.27 157.9 79.85 157.9 81.69
C 157.9 84.17 157.28 86.19 156.02 87.75
C 154.76 89.31 152.93 90.2 150.51 90.42
L 158.68 104.93
H 156.2
L 148.16 90.55
H 139.21
Z
M 139.21 88.62
H 149.5
C 150.84 88.62 151.96 88.36 152.85 87.84
C 153.74 87.32 154.4 86.63 154.83 85.78
C 155.28 84.89 155.51 83.89 155.51 82.79
V 80.68
C 155.51 79.6 155.28 78.62 154.83 77.74
C 154.4 76.85 153.74 76.14 152.85 75.62
C 151.96 75.1 150.84 74.84 149.5 74.84
H 139.21
V 88.62
Z`;

const letterA = `M 192.16 104.93
H 189.87
L 186.24 94.73
H 172.27
L 168.64 104.93
H 166.39
L 177.83 72.87
H 180.72
L 192.16 104.93
Z
M 185.64 92.8
L 181.37 80.68
L 179.3 74.98
H 179.16
L 177.14 80.68
L 172.87 92.8
H 185.64
Z`;

const letterJ = `M 202.35 72.87
H 215.76
V 96.57
C 215.76 98.47 215.41 100.09 214.71 101.44
C 214 102.76 213.02 103.77 211.77 104.47
C 210.51 105.15 209.03 105.48 207.31 105.48
C 205.17 105.48 203.36 104.89 201.89 103.69
C 200.42 102.5 199.47 100.97 199.04 99.1
L 201.02 98.59
C 201.39 100 202.11 101.18 203.18 102.13
C 204.25 103.05 205.64 103.51 207.36 103.51
C 209.38 103.51 210.91 102.9 211.95 101.67
C 212.99 100.41 213.51 98.61 213.51 96.25
V 74.84
H 202.35
V 72.87
Z`;

const letterS = `M 236.73 105.48
C 234.1 105.48 231.91 104.99 230.16 104.01
C 228.42 103 226.93 101.7 225.71 100.11
L 227.41 98.73
C 228.54 100.23 229.82 101.41 231.26 102.27
C 232.73 103.09 234.57 103.51 236.78 103.51
C 239.35 103.51 241.32 102.9 242.7 101.67
C 244.11 100.45 244.82 98.71 244.82 96.48
C 244.82 95.01 244.52 93.85 243.94 92.99
C 243.39 92.1 242.6 91.41 241.55 90.92
C 240.54 90.43 239.38 90.05 238.06 89.77
L 235.08 89.18
C 233.02 88.78 231.37 88.18 230.12 87.38
C 228.86 86.59 227.94 85.62 227.36 84.49
C 226.81 83.36 226.53 82.09 226.53 80.68
C 226.53 78.84 226.95 77.31 227.77 76.08
C 228.63 74.83 229.82 73.89 231.36 73.28
C 232.89 72.64 234.66 72.32 236.68 72.32
C 239.07 72.32 241.08 72.74 242.7 73.6
C 244.33 74.43 245.63 75.58 246.61 77.05
L 244.91 78.29
C 244.02 77 242.9 76.02 241.55 75.35
C 240.21 74.64 238.54 74.29 236.55 74.29
C 234.13 74.29 232.21 74.83 230.8 75.9
C 229.43 76.94 228.74 78.52 228.74 80.63
C 228.74 82.01 229.03 83.13 229.61 83.98
C 230.19 84.84 230.99 85.52 232 86.01
C 233.04 86.46 234.23 86.83 235.58 87.11
L 238.52 87.71
C 240.7 88.13 242.4 88.76 243.62 89.59
C 244.85 90.42 245.72 91.41 246.24 92.57
C 246.76 93.71 247.02 94.98 247.02 96.39
C 247.02 98.32 246.59 99.96 245.73 101.3
C 244.91 102.65 243.73 103.69 242.2 104.43
C 240.67 105.13 238.84 105.48 236.73 105.48
Z`;

const wordmark = [letterT, letterR, letterA, letterJ, letterS].join(" ");

/**
 * The trajs mark on its own.
 *
 * **When to use**
 *
 * Use where the mark stands for trajs in a square or a tall slot — an app icon,
 * a favicon-sized mark, a switcher — and not beside the name it stands for.
 *
 * **Details**
 *
 * Nothing labels the mark: one that carries meaning is given its `aria-label`
 * where it is used, and one that does not is `aria-hidden`.
 *
 * The mark is lines rather than a shape, and is stroked in `currentColor`, so it
 * reads in the colour of the text it sits beside. A class sets what is not said:
 * `stroke-[3]` the weight the lines are drawn at, `stroke-red-500` their colour,
 * and `h-6 w-auto` the size.
 *
 * @see {@link Logo} for the same mark with the wordmark beside it.
 * @category components
 */
export const Icon = (props: ComponentProps<"svg">) => (
  <svg
    width={92}
    height={146}
    viewBox="0 0 92 146"
    stroke="currentColor"
    strokeWidth={markWeight}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d={mark} fill="none" />
  </svg>
);

/**
 * The trajs mark with the wordmark beside it.
 *
 * **When to use**
 *
 * Use where the mark is the name — a header, a footer, a page of a site — and
 * not where the name is already written.
 *
 * **Details**
 *
 * The logo is the icon and the letters: the same mark, in the box the icon keeps
 * it in, with the wordmark set 13.96 to its right. The box is therefore as tall
 * as the icon's, so a header and a favicon draw the mark at the same size.
 *
 * The wordmark is drawn as paths and not set in a font, so it reads the same
 * wherever it is put. The letters are filled and the mark is stroked, both in
 * `currentColor`; a class therefore colours the name with `fill-red-500` and the
 * mark with `stroke-red-500`, or both with `text-red-500`, and the weight of the
 * mark with `stroke-[3]`, which leaves the letters as they are.
 *
 * @see {@link Icon} for the mark alone.
 * @category components
 */
export const Logo = (props: ComponentProps<"svg">) => (
  <svg
    width={250}
    height={146}
    viewBox="0 0 250 146"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth={markWeight}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d={wordmark} stroke="none" />
    <path d={mark} fill="none" />
  </svg>
);
