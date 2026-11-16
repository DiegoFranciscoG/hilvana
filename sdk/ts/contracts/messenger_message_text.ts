// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato messenger.message.text. No editar a mano.
export type MessengerMessageText = {
  entry: Array<{
    id: string;
    messaging: Array<{
      message: {
        mid: string;
        text: string;
      };
      recipient: {
        id: string;
      };
      sender: {
        id: string;
      };
      timestamp: number;
    }>;
    time: number;
  }>;
  object: "page";
};
