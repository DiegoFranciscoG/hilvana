// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato whatsapp.statuses.delivered. No editar a mano.
export type WhatsappStatusesDelivered = {
  entry: Array<{
    changes: Array<{
      field: "messages";
      value: {
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses: Array<{
          id: string;
          pricing: {
            billable: boolean;
            category: "service";
            pricing_model: string;
          };
          recipient_id: string;
          status: "delivered";
          timestamp: string;
        }>;
      };
    }>;
    id: string;
  }>;
  object: "whatsapp_business_account";
};
