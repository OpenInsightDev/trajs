# @trajs/cli

The `trajs` command line: read what a `.trajs` recording states about itself
without opening it in a viewer.

## Commands

### `trajs inspect <file-path>`

Prints the header a `.trajs` file starts with — the metadata the recording goes
by and the toolkit and kits it was written with — as JSON. The header is written
on one line until `--indent` says otherwise:

```bash
trajs inspect recording.trajs
trajs inspect recording.trajs --indent 2
```

## Development

- Run the command from source, on the Node runtime's own TypeScript support:

```bash
pnpm --filter @trajs/cli dev inspect recording.trajs
```

- Build the executable:

```bash
pnpm --filter @trajs/cli build
```
