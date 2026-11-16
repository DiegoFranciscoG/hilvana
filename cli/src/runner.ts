/** Ejecución de procesos (inyectable para probar la CLI sin tocar Docker ni la nube). */

export interface RunOptions {
  stdin?: string;
  env?: Record<string, string>;
  /** Hereda la terminal (salida en vivo) en lugar de capturarla. */
  inherit?: boolean;
  cwd?: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Runner = (command: string[], options?: RunOptions) => Promise<RunResult>;

export const denoRunner: Runner = async (command, options = {}) => {
  const [program, ...args] = command;
  const child = new Deno.Command(program, {
    args,
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin !== undefined ? 'piped' : options.inherit ? 'inherit' : 'null',
    stdout: options.inherit ? 'inherit' : 'piped',
    stderr: options.inherit ? 'inherit' : 'piped',
  }).spawn();
  if (options.stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(options.stdin));
    await writer.close();
  }
  const output = await child.output();
  const decoder = new TextDecoder();
  return {
    code: output.code,
    stdout: options.inherit ? '' : decoder.decode(output.stdout),
    stderr: options.inherit ? '' : decoder.decode(output.stderr),
  };
};

export interface Io {
  print(line: string): void;
  error(line: string): void;
  ask(question: string): Promise<string>;
  readStdin(): Promise<string>;
}

export const terminalIo: Io = {
  print: (line) => console.log(line),
  error: (line) => console.error(line),
  ask: (question) => Promise.resolve(prompt(question) ?? ''),
  readStdin: async () => new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer()),
};
