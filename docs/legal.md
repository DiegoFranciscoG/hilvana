# Legalidad

Resumen de cómo el proyecto cumple las reglas que lo afectan. Las fuentes están numeradas en
[investigacion.md](investigacion.md). **No es asesoría legal**: antes de operar con clientes reales,
valida con un abogado de tu país.

## Plataformas de Meta y Shopify

| Regla | Cómo se cumple |
|---|---|
| Solo APIs oficiales | WhatsApp Cloud API, Messenger Platform, Instagram Messaging y Shopify Admin GraphQL (#21–#36). El repositorio no incluye ni recomienda librerías que imiten WhatsApp Web. |
| Firmas de webhooks | HMAC-SHA256 sobre el cuerpo crudo con comparación en tiempo constante (#21, #32). |
| Ventanas de mensajería | 24 h para texto libre; fuera, solo plantillas aprobadas en WhatsApp y `HUMAN_AGENT` (personas, 7 días, con permiso aprobado) en Messenger e Instagram (#22, #27, #29, #30). |
| Política de IA de WhatsApp (#25) | El agente es específico del negocio, no un asistente de propósito general; se presenta como automático; los datos de la plataforma no se usan para entrenar modelos (el laboratorio solo infiere la forma de los webhooks, con muestras anónimas). |
| Proveedor de IA de terceros | Cada espacio elige proveedor y clave. Elige uno que no entrene con tus datos y documenta la transferencia internacional (ver LOPDP abajo). |
| Plataforma alojada para terceros | Ofrecer Hilvana como servicio a otros negocios exige registrarse como Tech Provider de Meta. Hoy el modo previsto es autoalojado: cada espacio conecta su propia app y cuenta. |
| Shopify | Alcances mínimos (`read_products`, `read_inventory`, `read_orders`) y los tres webhooks de cumplimiento (`customers/data_request`, `customers/redact`, `shop/redact`) responden y quedan auditados (#33, #34). |

## Datos personales: LOPDP (Ecuador) y Ley 29733 (Perú)

En una instalación de Hilvana, **cada negocio es responsable** del tratamiento de los datos de sus
clientes y quien opera la instalación (por ejemplo, una agencia) actúa como **encargado**.

| Obligación | Fuente | Implementación |
|---|---|---|
| Informar finalidad, base legal, tiempo de conservación y derechos | LOPDP art. 12 (#50) | Plantilla de aviso en [privacidad.md](privacidad.md); el asistente se identifica como automático en su primer mensaje. |
| Consentimiento previo y expreso para promociones | LOPDP; Ley 29733 art. 13.5 (#50, #52) | `contact.consent_marketing` con fecha y fuente; `set_contact_consent()` lo registra en auditoría. |
| Oposición a mercadotecnia directa en cualquier momento | LOPDP art. 16 (#50) | `opted_out_at` y RPC para registrarlo. |
| Acceso y portabilidad | LOPDP arts. 13 y 17 | `export_contact()` devuelve el JSON del contacto, sus conversaciones y oportunidades. |
| Rectificación y eliminación en 15 días, gratis | LOPDP arts. 14 y 15 | `erase_contact()` borra en cascada; la eliminación de cuenta borra los datos del usuario. |
| Conservación limitada | LOPDP art. 15.4 | `plan.retention_days` y purga periódica (`private.telar_purge_expired()`). |
| Protección desde el diseño | LOPDP art. 47.9 | RLS, minimización (la app enmascara números sin nombre), anonimización del laboratorio, avisos push sin contenido. |
| Evaluación de impacto si hay alto riesgo | LOPDP art. 42 | El agente no toma decisiones con efectos jurídicos; si un negocio lo usa para eso, debe hacer la evaluación antes. |
| Vulneraciones de seguridad | LOPDP arts. 43 y 46; Reglamento peruano art. 34.3 (#50, #52) | Aviso a la Autoridad (y a ARCOTEL) en 5 días y al titular en 3 días en Ecuador; al titular en 48 horas en Perú. El encargado avisa al responsable en 2 días. `audit_log` y los registros sin secretos sirven para la investigación. |
| Transferencias internacionales | LOPDP arts. 55–57 | Supabase, Google Cloud y el proveedor de IA pueden estar fuera del país: hace falta nivel adecuado o garantías contractuales. Documentarlo en el aviso de privacidad. |

## Tiendas de apps

Eliminación de cuenta dentro de la app y por enlace web, etiquetas de privacidad, formulario de
seguridad de datos y funcionalidad nativa: ver [tiendas.md](tiendas.md) (#37–#43).

## Marcas

WhatsApp, Instagram, Messenger, Meta y Shopify se nombran **solo como texto descriptivo de
compatibilidad**. Sus logos no forman parte del logo, el ícono ni el nombre de Hilvana. Ver
[marca.md](marca.md).

## Licencias

| Parte | Licencia |
|---|---|
| Núcleo (Telar, laboratorio, agente, app, CLI, habilidad, migraciones) | AGPL-3.0-or-later (`LICENSE`): quien lo ofrezca como servicio debe compartir sus mejoras. |
| Conectores (`telar/connectors/`) y SDK (`sdk/`) | MIT (archivo `LICENSE` en cada carpeta). |
| Fuentes Fraunces e IBM Plex Sans | SIL Open Font License 1.1 (`app/assets/fonts/`). |
| Dependencias | Ver [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md); todas son compatibles con AGPL-3.0. |

## Nombre

Antes de lanzar comercialmente: búsqueda de anterioridad y registro de la marca en SENADI (Ecuador)
y, si aplica, INDECOPI (Perú).
