// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato instagram.message.text. No editar a mano.

class InstagramMessageText {
  final List<InstagramMessageTextEntryItem> entry;
  final String objectField;
  const InstagramMessageText({required this.entry, required this.objectField});
  factory InstagramMessageText.fromJson(Map<String, dynamic> json) => InstagramMessageText(
      entry: (json['entry'] as List<dynamic>).map((v) => InstagramMessageTextEntryItem.fromJson(v as Map<String, dynamic>)).toList(),
      objectField: json['object'] as String,
      );
}

class InstagramMessageTextEntryItem {
  final String id;
  final List<InstagramMessageTextEntryItemMessagingItem> messaging;
  final int time;
  const InstagramMessageTextEntryItem({required this.id, required this.messaging, required this.time});
  factory InstagramMessageTextEntryItem.fromJson(Map<String, dynamic> json) => InstagramMessageTextEntryItem(
      id: json['id'] as String,
      messaging: (json['messaging'] as List<dynamic>).map((v) => InstagramMessageTextEntryItemMessagingItem.fromJson(v as Map<String, dynamic>)).toList(),
      time: (json['time'] as num).toInt(),
      );
}

class InstagramMessageTextEntryItemMessagingItem {
  final InstagramMessageTextEntryItemMessagingItemMessage message;
  final InstagramMessageTextEntryItemMessagingItemRecipient recipient;
  final InstagramMessageTextEntryItemMessagingItemSender sender;
  final int timestamp;
  const InstagramMessageTextEntryItemMessagingItem({required this.message, required this.recipient, required this.sender, required this.timestamp});
  factory InstagramMessageTextEntryItemMessagingItem.fromJson(Map<String, dynamic> json) => InstagramMessageTextEntryItemMessagingItem(
      message: InstagramMessageTextEntryItemMessagingItemMessage.fromJson(json['message'] as Map<String, dynamic>),
      recipient: InstagramMessageTextEntryItemMessagingItemRecipient.fromJson(json['recipient'] as Map<String, dynamic>),
      sender: InstagramMessageTextEntryItemMessagingItemSender.fromJson(json['sender'] as Map<String, dynamic>),
      timestamp: (json['timestamp'] as num).toInt(),
      );
}

class InstagramMessageTextEntryItemMessagingItemMessage {
  final String mid;
  final String text;
  const InstagramMessageTextEntryItemMessagingItemMessage({required this.mid, required this.text});
  factory InstagramMessageTextEntryItemMessagingItemMessage.fromJson(Map<String, dynamic> json) => InstagramMessageTextEntryItemMessagingItemMessage(
      mid: json['mid'] as String,
      text: json['text'] as String,
      );
}

class InstagramMessageTextEntryItemMessagingItemRecipient {
  final String id;
  const InstagramMessageTextEntryItemMessagingItemRecipient({required this.id});
  factory InstagramMessageTextEntryItemMessagingItemRecipient.fromJson(Map<String, dynamic> json) => InstagramMessageTextEntryItemMessagingItemRecipient(
      id: json['id'] as String,
      );
}

class InstagramMessageTextEntryItemMessagingItemSender {
  final String id;
  const InstagramMessageTextEntryItemMessagingItemSender({required this.id});
  factory InstagramMessageTextEntryItemMessagingItemSender.fromJson(Map<String, dynamic> json) => InstagramMessageTextEntryItemMessagingItemSender(
      id: json['id'] as String,
      );
}
