// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato messenger.message.text. No editar a mano.

class MessengerMessageText {
  final List<MessengerMessageTextEntryItem> entry;
  final String objectField;
  const MessengerMessageText({required this.entry, required this.objectField});
  factory MessengerMessageText.fromJson(Map<String, dynamic> json) => MessengerMessageText(
      entry: (json['entry'] as List<dynamic>).map((v) => MessengerMessageTextEntryItem.fromJson(v as Map<String, dynamic>)).toList(),
      objectField: json['object'] as String,
      );
}

class MessengerMessageTextEntryItem {
  final String id;
  final List<MessengerMessageTextEntryItemMessagingItem> messaging;
  final int time;
  const MessengerMessageTextEntryItem({required this.id, required this.messaging, required this.time});
  factory MessengerMessageTextEntryItem.fromJson(Map<String, dynamic> json) => MessengerMessageTextEntryItem(
      id: json['id'] as String,
      messaging: (json['messaging'] as List<dynamic>).map((v) => MessengerMessageTextEntryItemMessagingItem.fromJson(v as Map<String, dynamic>)).toList(),
      time: (json['time'] as num).toInt(),
      );
}

class MessengerMessageTextEntryItemMessagingItem {
  final MessengerMessageTextEntryItemMessagingItemMessage message;
  final MessengerMessageTextEntryItemMessagingItemRecipient recipient;
  final MessengerMessageTextEntryItemMessagingItemSender sender;
  final int timestamp;
  const MessengerMessageTextEntryItemMessagingItem({required this.message, required this.recipient, required this.sender, required this.timestamp});
  factory MessengerMessageTextEntryItemMessagingItem.fromJson(Map<String, dynamic> json) => MessengerMessageTextEntryItemMessagingItem(
      message: MessengerMessageTextEntryItemMessagingItemMessage.fromJson(json['message'] as Map<String, dynamic>),
      recipient: MessengerMessageTextEntryItemMessagingItemRecipient.fromJson(json['recipient'] as Map<String, dynamic>),
      sender: MessengerMessageTextEntryItemMessagingItemSender.fromJson(json['sender'] as Map<String, dynamic>),
      timestamp: (json['timestamp'] as num).toInt(),
      );
}

class MessengerMessageTextEntryItemMessagingItemMessage {
  final String mid;
  final String text;
  const MessengerMessageTextEntryItemMessagingItemMessage({required this.mid, required this.text});
  factory MessengerMessageTextEntryItemMessagingItemMessage.fromJson(Map<String, dynamic> json) => MessengerMessageTextEntryItemMessagingItemMessage(
      mid: json['mid'] as String,
      text: json['text'] as String,
      );
}

class MessengerMessageTextEntryItemMessagingItemRecipient {
  final String id;
  const MessengerMessageTextEntryItemMessagingItemRecipient({required this.id});
  factory MessengerMessageTextEntryItemMessagingItemRecipient.fromJson(Map<String, dynamic> json) => MessengerMessageTextEntryItemMessagingItemRecipient(
      id: json['id'] as String,
      );
}

class MessengerMessageTextEntryItemMessagingItemSender {
  final String id;
  const MessengerMessageTextEntryItemMessagingItemSender({required this.id});
  factory MessengerMessageTextEntryItemMessagingItemSender.fromJson(Map<String, dynamic> json) => MessengerMessageTextEntryItemMessagingItemSender(
      id: json['id'] as String,
      );
}
