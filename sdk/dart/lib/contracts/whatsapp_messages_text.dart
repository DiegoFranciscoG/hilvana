// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato whatsapp.messages.text. No editar a mano.

class WhatsappMessagesText {
  final List<WhatsappMessagesTextEntryItem> entry;
  final String objectField;
  const WhatsappMessagesText({required this.entry, required this.objectField});
  factory WhatsappMessagesText.fromJson(Map<String, dynamic> json) => WhatsappMessagesText(
      entry: (json['entry'] as List<dynamic>).map((v) => WhatsappMessagesTextEntryItem.fromJson(v as Map<String, dynamic>)).toList(),
      objectField: json['object'] as String,
      );
}

class WhatsappMessagesTextEntryItem {
  final List<WhatsappMessagesTextEntryItemChangesItem> changes;
  final String id;
  const WhatsappMessagesTextEntryItem({required this.changes, required this.id});
  factory WhatsappMessagesTextEntryItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItem(
      changes: (json['changes'] as List<dynamic>).map((v) => WhatsappMessagesTextEntryItemChangesItem.fromJson(v as Map<String, dynamic>)).toList(),
      id: json['id'] as String,
      );
}

class WhatsappMessagesTextEntryItemChangesItem {
  final String field;
  final WhatsappMessagesTextEntryItemChangesItemValue value;
  const WhatsappMessagesTextEntryItemChangesItem({required this.field, required this.value});
  factory WhatsappMessagesTextEntryItemChangesItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItem(
      field: json['field'] as String,
      value: WhatsappMessagesTextEntryItemChangesItemValue.fromJson(json['value'] as Map<String, dynamic>),
      );
}

class WhatsappMessagesTextEntryItemChangesItemValue {
  final List<WhatsappMessagesTextEntryItemChangesItemValueContactsItem> contacts;
  final List<WhatsappMessagesTextEntryItemChangesItemValueMessagesItem> messages;
  final String messagingProduct;
  final WhatsappMessagesTextEntryItemChangesItemValueMetadata metadata;
  const WhatsappMessagesTextEntryItemChangesItemValue({required this.contacts, required this.messages, required this.messagingProduct, required this.metadata});
  factory WhatsappMessagesTextEntryItemChangesItemValue.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValue(
      contacts: (json['contacts'] as List<dynamic>).map((v) => WhatsappMessagesTextEntryItemChangesItemValueContactsItem.fromJson(v as Map<String, dynamic>)).toList(),
      messages: (json['messages'] as List<dynamic>).map((v) => WhatsappMessagesTextEntryItemChangesItemValueMessagesItem.fromJson(v as Map<String, dynamic>)).toList(),
      messagingProduct: json['messaging_product'] as String,
      metadata: WhatsappMessagesTextEntryItemChangesItemValueMetadata.fromJson(json['metadata'] as Map<String, dynamic>),
      );
}

class WhatsappMessagesTextEntryItemChangesItemValueContactsItem {
  final WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile profile;
  final String waId;
  const WhatsappMessagesTextEntryItemChangesItemValueContactsItem({required this.profile, required this.waId});
  factory WhatsappMessagesTextEntryItemChangesItemValueContactsItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValueContactsItem(
      profile: WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile.fromJson(json['profile'] as Map<String, dynamic>),
      waId: json['wa_id'] as String,
      );
}

class WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile {
  final String name;
  const WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile({required this.name});
  factory WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValueContactsItemProfile(
      name: json['name'] as String,
      );
}

class WhatsappMessagesTextEntryItemChangesItemValueMessagesItem {
  final String from;
  final String id;
  final WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText text;
  final String timestamp;
  final String type;
  const WhatsappMessagesTextEntryItemChangesItemValueMessagesItem({required this.from, required this.id, required this.text, required this.timestamp, required this.type});
  factory WhatsappMessagesTextEntryItemChangesItemValueMessagesItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValueMessagesItem(
      from: json['from'] as String,
      id: json['id'] as String,
      text: WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText.fromJson(json['text'] as Map<String, dynamic>),
      timestamp: json['timestamp'] as String,
      type: json['type'] as String,
      );
}

class WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText {
  final String body;
  const WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText({required this.body});
  factory WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValueMessagesItemText(
      body: json['body'] as String,
      );
}

class WhatsappMessagesTextEntryItemChangesItemValueMetadata {
  final String displayPhoneNumber;
  final String phoneNumberId;
  const WhatsappMessagesTextEntryItemChangesItemValueMetadata({required this.displayPhoneNumber, required this.phoneNumberId});
  factory WhatsappMessagesTextEntryItemChangesItemValueMetadata.fromJson(Map<String, dynamic> json) => WhatsappMessagesTextEntryItemChangesItemValueMetadata(
      displayPhoneNumber: json['display_phone_number'] as String,
      phoneNumberId: json['phone_number_id'] as String,
      );
}
