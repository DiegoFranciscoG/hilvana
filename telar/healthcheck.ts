/** Chequeo de salud del contenedor (la imagen distroless no trae curl ni shell). */
const port = Deno.env.get('TELAR_PORT') ?? '8787';
try {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(3_000) });
  await response.body?.cancel();
  Deno.exit(response.ok ? 0 : 1);
} catch {
  Deno.exit(1);
}
