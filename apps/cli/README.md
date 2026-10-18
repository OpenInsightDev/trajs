# @trajs/cli

The `trajs` command line: read what a trajectory states about itself without
opening it in a viewer.

## Commands

### `trajs inspect <file-path>`

Prints what a `.trajs` file states — the toolkit and kits it was written with, or
with `--metadata` how its parts were carried and what it is named by — as JSON. A
trajectory states each of those algorithms as the code the format carries it as, and
the metadata is printed with the name instead. The JSON is written on one line
until `--indent` says otherwise:

```bash
trajs inspect trajectory.trajs
trajs inspect trajectory.trajs --metadata
trajs inspect trajectory.trajs --metadata --indent 2
```

## Development

- Run the command from source, on the Node runtime's own TypeScript support:

```bash
pnpm --filter @trajs/cli dev inspect trajectory.trajs
```

- Build the executable:

```bash
pnpm --filter @trajs/cli build
```
