// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato whatsapp.messages.image. No editar a mano.

class WhatsappMessagesImage {
  final List<WhatsappMessagesImageEntryItem> entry;
  final String objectField;
  const WhatsappMessagesImage({required this.entry, required this.objectField});
  factory WhatsappMessagesImage.fromJson(Map<String, dynamic> json) => WhatsappMessagesImage(
      entry: (json['entry'] as List<dynamic>).map((v) => WhatsappMessagesImageEntryItem.fromJson(v as Map<String, dynamic>)).toList(),
      objectField: json['object'] as String,
      );
}

class WhatsappMessagesImageEntryItem {
  final List<WhatsappMessagesImageEntryItemChangesItem> changes;
  final String id;
  const WhatsappMessagesImageEntryItem({required this.changes, required this.id});
  factory WhatsappMessagesImageEntryItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItem(
      changes: (json['changes'] as List<dynamic>).map((v) => WhatsappMessagesImageEntryItemChangesItem.fromJson(v as Map<String, dynamic>)).toList(),
      id: json['id'] as String,
      );
}

class WhatsappMessagesImageEntryItemChangesItem {
  final String field;
  final WhatsappMessagesImageEntryItemChangesItemValue value;
  const WhatsappMessagesImageEntryItemChangesItem({required this.field, required this.value});
  factory WhatsappMessagesImageEntryItemChangesItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItem(
      field: json['field'] as String,
      value: WhatsappMessagesImageEntryItemChangesItemValue.fromJson(json['value'] as Map<String, dynamic>),
      );
}

class WhatsappMessagesImageEntryItemChangesItemValue {
  final List<WhatsappMessagesImageEntryItemChangesItemValueContactsItem> contacts;
  final List<WhatsappMessagesImageEntryItemChangesItemValueMessagesItem> messages;
  final String messagingProduct;
  final WhatsappMessagesImageEntryItemChangesItemValueMetadata metadata;
  const WhatsappMessagesImageEntryItemChangesItemValue({required this.contacts, required this.messages, required this.messagingProduct, required this.metadata});
  factory WhatsappMessagesImageEntryItemChangesItemValue.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValue(
      contacts: (json['contacts'] as List<dynamic>).map((v) => WhatsappMessagesImageEntryItemChangesItemValueContactsItem.fromJson(v as Map<String, dynamic>)).toList(),
      messages: (json['messages'] as List<dynamic>).map((v) => WhatsappMessagesImageEntryItemChangesItemValueMessagesItem.fromJson(v as Map<String, dynamic>)).toList(),
      messagingProduct: json['messaging_product'] as String,
      metadata: WhatsappMessagesImageEntryItemChangesItemValueMetadata.fromJson(json['metadata'] as Map<String, dynamic>),
      );
}

class WhatsappMessagesImageEntryItemChangesItemValueContactsItem {
  final WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile profile;
  final String waId;
  const WhatsappMessagesImageEntryItemChangesItemValueContactsItem({required this.profile, required this.waId});
  factory WhatsappMessagesImageEntryItemChangesItemValueContactsItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValueContactsItem(
      profile: WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile.fromJson(json['profile'] as Map<String, dynamic>),
      waId: json['wa_id'] as String,
      );
}

class WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile {
  final String name;
  const WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile({required this.name});
  factory WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValueContactsItemProfile(
      name: json['name'] as String,
      );
}

class WhatsappMessagesImageEntryItemChangesItemValueMessagesItem {
  final String from;
  final String id;
  final WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage image;
  final String timestamp;
  final String type;
  const WhatsappMessagesImageEntryItemChangesItemValueMessagesItem({required this.from, required this.id, required this.image, required this.timestamp, required this.type});
  factory WhatsappMessagesImageEntryItemChangesItemValueMessagesItem.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValueMessagesItem(
      from: json['from'] as String,
      id: json['id'] as String,
      image: WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage.fromJson(json['image'] as Map<String, dynamic>),
      timestamp: json['timestamp'] as String,
      type: json['type'] as String,
      );
}

class WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage {
  final String caption;
  final String id;
  final String mimeType;
  final String sha256;
  const WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage({required this.caption, required this.id, required this.mimeType, required this.sha256});
  factory WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValueMessagesItemImage(
      caption: json['caption'] as String,
      id: json['id'] as String,
      mimeType: json['mime_type'] as String,
      sha256: json['sha256'] as String,
      );
}

class WhatsappMessagesImageEntryItemChangesItemValueMetadata {
  final String displayPhoneNumber;
  final String phoneNumberId;
  const WhatsappMessagesImageEntryItemChangesItemValueMetadata({required this.displayPhoneNumber, required this.phoneNumberId});
  factory WhatsappMessagesImageEntryItemChangesItemValueMetadata.fromJson(Map<String, dynamic> json) => WhatsappMessagesImageEntryItemChangesItemValueMetadata(
      displayPhoneNumber: json['display_phone_number'] as String,
      phoneNumberId: json['phone_number_id'] as String,
      );
}
