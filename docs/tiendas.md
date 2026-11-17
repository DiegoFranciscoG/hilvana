# App Store y Google Play: fichas y lista de envío

Material preparado para publicar la app de Hilvana. **No se envió nada**: la publicación la hace quien
opere la cuenta de desarrollador, idealmente a nombre de una organización (#42).

## Requisitos verificados

| Requisito | Fuente | Estado en la app |
|---|---|---|
| Eliminar la cuenta desde la app (no solo desactivarla) | Apple 5.1.1(v) (#37) | Ajustes → "Eliminar mi cuenta": borra datos y usuario de Auth y cierra la sesión en todos los dispositivos (T-11). |
| Enlace web para pedir la eliminación sin reinstalar | Google Play (#40) | Publicar una página con el mismo flujo (iniciar sesión → eliminar) en el dominio del operador. |
| Funcionalidad nativa, no un sitio empaquetado | Apple 4.2 (#38) | Bandeja en tiempo real, avisos push nativos, modo de dos paneles en tabletas y escritorio. |
| Xcode 26 y SDK de iOS 26 | Apple (#39) | Compilar con Flutter 3.50 en una Mac o en Codemagic (decisión pendiente). |
| API de destino 36 | Google Play (#43) | Fijar `targetSdk 36` al generar la carpeta `android/`. |
| 12 testers durante 14 días | Google Play, cuentas personales nuevas (#42) | Evitarlo con cuenta de organización; si es personal, planificar la prueba cerrada. |

## Ficha (español)

- **Nombre:** Hilvana
- **Subtítulo (App Store, 30 caracteres):** Atiende a tus clientes en un hilo
- **Descripción corta (Google Play, 80):** Mensajes de WhatsApp, Instagram y Messenger de tu negocio en una sola bandeja.
- **Descripción:**

  Hilvana reúne en una sola bandeja las conversaciones de tu negocio que llegan por WhatsApp,
  Instagram y Messenger. Un asistente automático responde con tu catálogo y tus horarios, y cuando hace
  falta una persona, te avisa para que tomes la conversación.

  - Bandeja en tiempo real para todo el equipo.
  - Tomar, responder y devolver conversaciones al asistente.
  - El asistente se presenta como automático y nunca inventa precios: los toma de tu catálogo.
  - Avisos cuando un cliente necesita a una persona.
  - Elimina tu cuenta cuando quieras desde Ajustes.

  WhatsApp, Instagram, Messenger y Shopify son marcas de sus dueños; Hilvana se conecta a ellos por sus
  APIs oficiales.

- **Categoría:** Negocios / Productividad
- **Notas para revisión:** cuenta de prueba con datos ficticios (`demo@hilvana.test`, contraseña en el
  formulario de revisión); el negocio de demo no envía mensajes reales.

## Etiquetas de privacidad (App Store) y seguridad de datos (Google Play)

| Dato | Recolectado | Vinculado al usuario | Uso | Se puede borrar |
|---|---|---|---|---|
| Correo y nombre de la cuenta | Sí | Sí | Funcionalidad de la app (inicio de sesión) | Sí, desde la app |
| Mensajes de clientes del negocio | Sí | Sí (al espacio) | Funcionalidad de la app | Sí, el dueño del espacio |
| Identificadores de clientes en el canal | Sí | Sí (al espacio) | Funcionalidad de la app | Sí |
| Token de notificaciones del dispositivo | Sí | Sí | Avisos push | Sí, al eliminar la cuenta |
| Datos de uso o publicidad | No | — | — | — |
| Ubicación, contactos del teléfono, fotos | No | — | — | — |

Cifrado en tránsito: sí (HTTPS). La app no tiene publicidad ni rastreo entre apps.

## Capturas

| Pantalla | Archivo | Tamaño |
|---|---|---|
| Bandeja con conversaciones | `docs/img/bandeja.png` | 2560 × 1600 (escritorio 1280 × 800 a 2x) |
| Conversación con el asistente y el equipo | `docs/img/conversacion.png` | 1080 × 1920 (teléfono 360 × 640 a 3x) |
| Ajustes con eliminar cuenta | `docs/img/ajustes.png` | 1080 × 1920 |
| Entrada | `docs/img/entrada.png` | 1080 × 1920 |

Se regeneran con `docker compose --profile tools run --rm screenshots` sobre el stack local con datos
ficticios. Antes de subirlas, revisa los tamaños que pide cada tienda ese día.

## Lista de envío

- [x] Carpetas de plataforma (`flutter create --platforms=android,ios,web,linux`) personalizadas: id
  `io.github.diegofranciscog.hilvana`, nombre, íconos desde `assets/brand` (`scripts/app-icons.sh`) y
  `targetSdk 36` (valor de Flutter 3.50).
- [x] El APK y el App Bundle compilan en Docker: `./scripts/build-android.sh [appbundle]`, con los valores
  de `app/dart-defines.json` (plantilla en `app/dart-defines.example.json`).
- [ ] Firma de Android con el almacén de llaves propio: `HILVANA_ANDROID_KEYSTORE`,
  `HILVANA_ANDROID_KEYSTORE_PASSWORD`, `HILVANA_ANDROID_KEY_ALIAS` y `HILVANA_ANDROID_KEY_PASSWORD` en el
  entorno de la shell al compilar; sin ellas el paquete sale firmado en modo depuración y Google Play lo rechaza.
- [ ] Firebase: valores públicos por `--dart-define` (`FirebaseConfig`); en iOS, llave APNs en Firebase y las
  capacidades Push Notifications y Remote notifications en Xcode.
- [ ] Política de privacidad publicada (plantilla en [privacidad.md](privacidad.md)) y enlace web de eliminación de cuenta.
- [ ] Cuenta de revisión con datos ficticios.
- [ ] Etiquetas de privacidad y formulario de seguridad de datos según la tabla anterior.
- [ ] Prueba cerrada (si la cuenta de Google Play es personal).
