// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato whatsapp.messages.text. No editar a mano.
export type WhatsappMessagesText = {
  entry: Array<{
    changes: Array<{
      field: "messages";
      value: {
        contacts: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages: Array<{
          from: string;
          id: string;
          text: {
            body: string;
          };
          timestamp: string;
          type: "text";
        }>;
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
      };
    }>;
    id: string;
  }>;
  object: "whatsapp_business_account";
};
