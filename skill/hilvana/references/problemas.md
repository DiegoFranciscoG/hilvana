# Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Meta no valida la URL del webhook | El verify token no coincide o la URL cambió (Quick Tunnel da una URL nueva cada vez). | Revisa la credencial con `hilvana space list` y copia otra vez la URL que imprime `hilvana tunnel`. |
| Los webhooks responden 401 | Firma inválida: el App Secret guardado no es el de la app que envía. | Vuelve a conectar con `hilvana connect meta` usando el App Secret correcto. |
| Llegan mensajes pero el agente no contesta | No hay una versión publicada del agente o la conversación está tomada por una persona. | Publica la especificación desde la app o revisa el estado de la conversación. |
| Respuesta marcada como `blocked` | Pasaron más de 24 h desde el último mensaje del cliente: fuera de la ventana solo van plantillas aprobadas. | Usa una plantilla aprobada de WhatsApp. |
| Un espacio responde lento | Superó los mensajes por minuto de su plan; sus mensajes esperan en su propia cola. | Es intencional (aislamiento). Sube el plan si el volumen es normal. |
| Alertas de deriva repetidas | Meta agregó campos o variantes de evento. | Revisa el diff, regenera tipos con `deno task lab types` y confirma que los conectores siguen leyendo lo que usan. |
| `hilvana up` dice que Docker no responde | Docker Desktop o el servicio docker no está iniciado. | Inícialo y vuelve a ejecutar. |
