# @trajs/cli

The `trajs` command line: read what a trajectory states about itself without
opening it in a viewer.

## Commands

### `trajs inspect <file-path>`

Prints the header a `.trajs` file starts with — the toolkit and kits it was
written with — as JSON. The header is written on one line until `--indent` says
otherwise:

```bash
trajs inspect trajectory.trajs
trajs inspect trajectory.trajs --indent 2
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
