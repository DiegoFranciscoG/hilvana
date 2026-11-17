/**
 * Capturas de la app web con los datos de demo ficticios (README y fichas de tienda). Corre dentro del
 * servicio `screenshots` del compose: Chromium sin interfaz contra http://localhost:8000.
 *   docker compose --profile tools run --rm screenshots
 * La app dibuja en un canvas (Flutter web): se interactúa por coordenadas en viewports fijos.
 * Escritorio: 1280×800 a 2x. Teléfono: 360×640 a 3x (1080×1920, proporción 9:16 que acepta Google Play).
 */
import { launch, type Page } from '@astral/astral';

const out = Deno.env.get('SHOTS_DIR') ?? '/out';
const password = Deno.env.get('DEMO_PASSWORD');
if (!password) throw new Error('Falta DEMO_PASSWORD');

const browser = await launch({
  path: '/usr/bin/chromium',
  args: ['--no-sandbox', '--lang=es-EC', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

const settle = (ms = 2500) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(width: number, height: number, scale: number, mobile: boolean): Promise<Page> {
  const tab = await browser.newPage();
  await tab.unsafelyGetCelestialBindings().Emulation.setDeviceMetricsOverride({
    width,
    height,
    deviceScaleFactor: scale,
    mobile,
  });
  return tab;
}

let visits = 0;

// El parámetro fuerza una carga completa: cambiar solo el `#` no dispara el evento load que espera goto.
async function visit(tab: Page, route: string): Promise<void> {
  // Una pestaña en segundo plano no pinta fotogramas (Flutter dibuja con requestAnimationFrame).
  await tab.unsafelyGetCelestialBindings().Page.bringToFront();
  await tab.goto(`http://localhost:8000/?v=${++visits}${route}`);
  await settle(4000);
}

async function shot(tab: Page, name: string): Promise<void> {
  await Deno.writeFile(`${out}/${name}.png`, await tab.screenshot({ format: 'png' }));
  console.log(`captura: ${name}.png`);
}

// Pantalla de entrada (teléfono, sin sesión).
const phone = await page(360, 640, 3, true);
await visit(phone, '#/login');
await shot(phone, 'entrada');

// Inicio de sesión real con la cuenta de demo y bandeja de escritorio con una conversación abierta.
const desk = await page(1280, 800, 2, false);
await visit(desk, '#/login');
await desk.mouse.click(640, 445);
await settle(400);
await desk.keyboard.type('demo@hilvana.test');
await desk.mouse.click(640, 506);
await settle(400);
await desk.keyboard.type(password);
await desk.mouse.click(640, 570);
await settle(5000);
await desk.mouse.click(190, 208); // Mateo C.: la conversación que el asistente pasó al equipo
await settle(3000);
await shot(desk, 'bandeja');

// Conversación y ajustes en el teléfono (misma sesión del navegador).
await visit(phone, '#/');
await settle(6000); // la lista llega por Realtime después de la carga
await phone.mouse.click(180, 208);
await settle(4000);
await shot(phone, 'conversacion');
await visit(phone, '#/settings');
await shot(phone, 'ajustes');

await browser.close();
