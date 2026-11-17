// SPDX-License-Identifier: MIT
/**
 * Ventanas de mensajería (T-07). Las reglas vienen de un archivo de datos, no del código:
 * telar/config/channel-policies.json (#22, #27, #30; S-02 para HUMAN_AGENT).
 */
import type { ChannelType } from '../../sdk/ts/envelope.ts';

export interface ChannelPolicy {
  /** Horas desde el último mensaje del cliente en que se puede escribir libremente. */
  serviceWindowHours: number;
  /** Qué se permite fuera de la ventana. */
  outsideWindow: 'template_only' | 'human_agent_tag' | 'none';
  /** Días que dura la ventana de respuesta humana con etiqueta (Messenger, Instagram). */
  humanAgentWindowDays?: number;
}

export type ChannelPolicies = Partial<Record<ChannelType, ChannelPolicy>>;

export type SendMode = 'free_text' | 'template' | 'human_agent_tag' | 'blocked';

export interface SendDecision {
  allowed: boolean;
  mode: SendMode;
  reason: 'inside_window' | 'template_outside_window' | 'human_agent_window' | 'window_closed' | 'not_messaging';
  windowExpiresAt: Date | null;
}

export interface SendRequest {
  channel: ChannelType;
  author: 'agent' | 'human';
  contentKind: 'text' | 'template';
  lastInboundAt: Date | null;
  now: Date;
  humanAgentApproved: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function decideSend(policies: ChannelPolicies, request: SendRequest): SendDecision {
  const policy = policies[request.channel];
  if (!policy) {
    return { allowed: false, mode: 'blocked', reason: 'not_messaging', windowExpiresAt: null };
  }
  const windowExpiresAt = request.lastInboundAt
    ? new Date(request.lastInboundAt.getTime() + policy.serviceWindowHours * HOUR)
    : null;
  const insideWindow = windowExpiresAt !== null && request.now.getTime() < windowExpiresAt.getTime();

  if (insideWindow) {
    return {
      allowed: true,
      mode: request.contentKind === 'template' ? 'template' : 'free_text',
      reason: 'inside_window',
      windowExpiresAt,
    };
  }

  if (policy.outsideWindow === 'template_only' && request.contentKind === 'template') {
    return { allowed: true, mode: 'template', reason: 'template_outside_window', windowExpiresAt };
  }

  if (
    policy.outsideWindow === 'human_agent_tag' && request.author === 'human' && request.humanAgentApproved &&
    request.contentKind === 'text' && request.lastInboundAt && policy.humanAgentWindowDays
  ) {
    const humanUntil = request.lastInboundAt.getTime() + policy.humanAgentWindowDays * DAY;
    if (request.now.getTime() < humanUntil) {
      return { allowed: true, mode: 'human_agent_tag', reason: 'human_agent_window', windowExpiresAt };
    }
  }

  return { allowed: false, mode: 'blocked', reason: 'window_closed', windowExpiresAt };
}

/** Fechas de cierre que se guardan en la conversación para mostrarlas en la bandeja. */
export function windowDeadlines(
  policies: ChannelPolicies,
  channel: ChannelType,
  lastInboundAt: Date,
): { serviceUntil: Date | null; humanUntil: Date | null } {
  const policy = policies[channel];
  if (!policy) return { serviceUntil: null, humanUntil: null };
  return {
    serviceUntil: new Date(lastInboundAt.getTime() + policy.serviceWindowHours * HOUR),
    humanUntil: policy.humanAgentWindowDays
      ? new Date(lastInboundAt.getTime() + policy.humanAgentWindowDays * DAY)
      : null,
  };
}
