/**
 * Túnel HTTPS temporal para recibir webhooks de Meta en la máquina local: Cloudflare Quick Tunnel
 * (sin cuenta; solo pruebas y desarrollo, docs/investigacion.md #48). Usa cloudflared si está
 * instalado y, si no, su imagen oficial con versión fija.
 */
export const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function findTunnelUrl(output: string): string | null {
  return output.match(QUICK_TUNNEL_URL)?.[0] ?? null;
}

export function tunnelCommand(options: { port: number; hasBinary: boolean; cloudflaredVersion: string; linux: boolean }): string[] {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('puerto inválido');
  if (options.hasBinary) return ['cloudflared', 'tunnel', '--no-autoupdate', '--url', `http://localhost:${options.port}`];
  return [
    'docker', 'run', '--rm',
    ...(options.linux ? ['--add-host', 'host.docker.internal:host-gateway'] : []),
    `cloudflare/cloudflared:${options.cloudflaredVersion}`,
    'tunnel', '--no-autoupdate', '--url', `http://host.docker.internal:${options.port}`,
  ];
}

export function webhookInstructions(baseUrl: string, credentials: { id: string; provider: string; label: string }[]): string[] {
  const lines = [`Túnel listo: ${baseUrl}`, 'URLs de callback para configurar en cada app:'];
  for (const credential of credentials) {
    const path = credential.provider === 'shopify' ? 'shopify' : 'meta';
    if (credential.provider === 'ai') continue;
    lines.push(`  ${credential.label}: ${baseUrl}/telar/webhooks/${path}/${credential.id}`);
  }
  lines.push('El verify token de Meta es el que guardaste con `hilvana connect meta`. La URL cambia cada vez que abres el túnel.');
  return lines;
}
