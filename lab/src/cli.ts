/**
 * Laboratorio de contratos desde la terminal.
 *   deno task lab bootstrap          contratos y tipos desde lab/fixtures
 *   deno task lab types              regenera los tipos TS y Dart desde lab/contracts
 *   deno task lab list               contratos y versiones
 *   deno task lab replay <url>       envía las muestras al Telar local (secreto en LAB_APP_SECRET)
 */
import { parseArgs } from '@std/cli';
import { join } from '@std/path';
import type { ChannelType } from '../../sdk/ts/envelope.ts';
import { loadLabConfig } from './anonymize.ts';
import { captureWebhook } from './capture.ts';
import { detectMetaChannel, eventKeysOf } from './events.ts';
import { FileContractStore } from './files.ts';
import { hydrate, replaySample } from './replay.ts';
import { fileStem, toDart, toTypeScript } from './typegen.ts';

const ROOT = new URL('../../', import.meta.url);
const LAB = join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'lab');
const SDK = join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'sdk');
const SHOPIFY_TOPICS: Record<string, string> = {
  'products-update.json': 'products/update',
  'customers-redact.json': 'customers/redact',
};

async function bootstrap(): Promise<void> {
  const config = await loadLabConfig();
  const store = new FileContractStore(LAB);
  for (const channel of ['whatsapp', 'messenger', 'instagram', 'shopify'] as ChannelType[]) {
    for await (const entry of Deno.readDir(join(LAB, 'fixtures', channel))) {
      if (!entry.name.endsWith('.json')) continue;
      const payload = JSON.parse(await Deno.readTextFile(join(LAB, 'fixtures', channel, entry.name)));
      const detected = channel === 'shopify' ? 'shopify' : detectMetaChannel(payload) ?? channel;
      const keys = eventKeysOf(detected, payload, SHOPIFY_TOPICS[entry.name]);
      const outcomes = await captureWebhook(store, config, { channel: detected, eventKeys: keys, payload });
      for (const o of outcomes) console.log(`${o.result.padEnd(9)} ${o.eventKey} v${o.contract.version}`);
    }
  }
  await types();
}

async function types(): Promise<void> {
  const store = new FileContractStore(LAB);
  const latest = new Map<string, Awaited<ReturnType<FileContractStore['list']>>[number]>();
  for (const contract of await store.list()) latest.set(contract.eventKey, contract);
  await Deno.mkdir(join(SDK, 'ts', 'contracts'), { recursive: true });
  await Deno.mkdir(join(SDK, 'dart', 'lib', 'contracts'), { recursive: true });
  for (const contract of latest.values()) {
    const stem = fileStem(contract.eventKey);
    await Deno.writeTextFile(
      join(SDK, 'ts', 'contracts', `${stem}.ts`),
      toTypeScript(contract.eventKey, contract.schema),
    );
    await Deno.writeTextFile(
      join(SDK, 'dart', 'lib', 'contracts', `${stem}.dart`),
      toDart(contract.eventKey, contract.schema),
    );
    console.log(`tipos   ${contract.eventKey} v${contract.version}`);
  }
}

async function list(): Promise<void> {
  for (const c of await new FileContractStore(LAB).list()) {
    console.log(`${c.eventKey.padEnd(36)} v${c.version}  ${c.schemaHash.slice(0, 12)}  muestras: ${c.sampleCount}`);
  }
}

async function replay(url: string, credentialProvider: 'meta' | 'shopify'): Promise<void> {
  const secret = Deno.env.get('LAB_APP_SECRET');
  if (!secret) throw new Error('Define LAB_APP_SECRET con el secreto de la app de prueba');
  for await (const dir of Deno.readDir(join(LAB, 'samples'))) {
    if (!dir.isDirectory) continue;
    const isShopify = dir.name.startsWith('shopify_');
    if ((credentialProvider === 'shopify') !== isShopify) continue;
    for await (const file of Deno.readDir(join(LAB, 'samples', dir.name))) {
      const sample = JSON.parse(await Deno.readTextFile(join(LAB, 'samples', dir.name, file.name)));
      const status = await replaySample({
        url,
        provider: credentialProvider,
        secret,
        shopifyTopic: isShopify ? dir.name.replace(/^shopify_/, '').replace('_', '/') : undefined,
      }, hydrate(sample));
      console.log(`${status} ${dir.name}/${file.name}`);
    }
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ['provider'], default: { provider: 'meta' } });
  const [command, target] = args._.map(String);
  switch (command) {
    case 'bootstrap':
      await bootstrap();
      break;
    case 'types':
      await types();
      break;
    case 'list':
      await list();
      break;
    case 'replay':
      if (!target) throw new Error('uso: deno task lab replay <url-del-webhook-local> [--provider meta|shopify]');
      await replay(target, args.provider === 'shopify' ? 'shopify' : 'meta');
      break;
    default:
      console.log('uso: deno task lab <bootstrap|types|list|replay>');
  }
}
