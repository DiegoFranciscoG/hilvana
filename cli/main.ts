/** Punto de entrada de la CLI `hilvana` (se compila a un binario único con `deno task compile:cli`). */
import { main } from './src/commands.ts';
import { parseEnv } from './src/env.ts';
import { denoRunner, terminalIo } from './src/runner.ts';

const toolchain = parseEnv(await Deno.readTextFile(new URL('../toolchain.env', import.meta.url)).catch(() => ''));

const code = await main(Deno.args, {
  run: denoRunner,
  io: terminalIo,
  readFile: (path) => Deno.readTextFile(path).catch(() => null),
  writeFile: (path, text) => Deno.writeTextFile(path, text, { mode: 0o600 }),
  env: (name) => Deno.env.get(name),
  fetch,
  versions: Object.fromEntries(toolchain),
  platform: Deno.build.os,
});
Deno.exit(code);
