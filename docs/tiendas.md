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

| Pantalla | Archivo |
|---|---|
| Bandeja con conversaciones | `docs/img/bandeja.png` |
| Conversación con el asistente y el equipo | `docs/img/conversacion.png` |
| Ajustes con eliminar cuenta | `docs/img/ajustes.png` |
| Entrada | `docs/img/entrada.png` |

## Lista de envío

- [ ] Carpetas de plataforma generadas con `flutter create --platforms=android,ios` y personalizadas (nombre, ícono desde `assets/brand/icono.svg`, `targetSdk 36`).
- [ ] Firebase configurado fuera del repositorio (`google-services.json`, `GoogleService-Info.plist`) y APNs habilitado.
- [ ] Política de privacidad publicada (plantilla en [privacidad.md](privacidad.md)) y enlace web de eliminación de cuenta.
- [ ] Cuenta de revisión con datos ficticios.
- [ ] Etiquetas de privacidad y formulario de seguridad de datos según la tabla anterior.
- [ ] Prueba cerrada (si la cuenta de Google Play es personal).
