// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato whatsapp.statuses.delivered. No editar a mano.

class WhatsappStatusesDelivered {
  final List<WhatsappStatusesDeliveredEntryItem> entry;
  final String objectField;
  const WhatsappStatusesDelivered({required this.entry, required this.objectField});
  factory WhatsappStatusesDelivered.fromJson(Map<String, dynamic> json) => WhatsappStatusesDelivered(
      entry: (json['entry'] as List<dynamic>).map((v) => WhatsappStatusesDeliveredEntryItem.fromJson(v as Map<String, dynamic>)).toList(),
      objectField: json['object'] as String,
      );
}

class WhatsappStatusesDeliveredEntryItem {
  final List<WhatsappStatusesDeliveredEntryItemChangesItem> changes;
  final String id;
  const WhatsappStatusesDeliveredEntryItem({required this.changes, required this.id});
  factory WhatsappStatusesDeliveredEntryItem.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItem(
      changes: (json['changes'] as List<dynamic>).map((v) => WhatsappStatusesDeliveredEntryItemChangesItem.fromJson(v as Map<String, dynamic>)).toList(),
      id: json['id'] as String,
      );
}

class WhatsappStatusesDeliveredEntryItemChangesItem {
  final String field;
  final WhatsappStatusesDeliveredEntryItemChangesItemValue value;
  const WhatsappStatusesDeliveredEntryItemChangesItem({required this.field, required this.value});
  factory WhatsappStatusesDeliveredEntryItemChangesItem.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItemChangesItem(
      field: json['field'] as String,
      value: WhatsappStatusesDeliveredEntryItemChangesItemValue.fromJson(json['value'] as Map<String, dynamic>),
      );
}

class WhatsappStatusesDeliveredEntryItemChangesItemValue {
  final String messagingProduct;
  final WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata metadata;
  final List<WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem> statuses;
  const WhatsappStatusesDeliveredEntryItemChangesItemValue({required this.messagingProduct, required this.metadata, required this.statuses});
  factory WhatsappStatusesDeliveredEntryItemChangesItemValue.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItemChangesItemValue(
      messagingProduct: json['messaging_product'] as String,
      metadata: WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata.fromJson(json['metadata'] as Map<String, dynamic>),
      statuses: (json['statuses'] as List<dynamic>).map((v) => WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem.fromJson(v as Map<String, dynamic>)).toList(),
      );
}

class WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata {
  final String displayPhoneNumber;
  final String phoneNumberId;
  const WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata({required this.displayPhoneNumber, required this.phoneNumberId});
  factory WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItemChangesItemValueMetadata(
      displayPhoneNumber: json['display_phone_number'] as String,
      phoneNumberId: json['phone_number_id'] as String,
      );
}

class WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem {
  final String id;
  final WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing pricing;
  final String recipientId;
  final String status;
  final String timestamp;
  const WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem({required this.id, required this.pricing, required this.recipientId, required this.status, required this.timestamp});
  factory WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItem(
      id: json['id'] as String,
      pricing: WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing.fromJson(json['pricing'] as Map<String, dynamic>),
      recipientId: json['recipient_id'] as String,
      status: json['status'] as String,
      timestamp: json['timestamp'] as String,
      );
}

class WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing {
  final bool billable;
  final String category;
  final String pricingModel;
  const WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing({required this.billable, required this.category, required this.pricingModel});
  factory WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing.fromJson(Map<String, dynamic> json) => WhatsappStatusesDeliveredEntryItemChangesItemValueStatusesItemPricing(
      billable: json['billable'] as bool,
      category: json['category'] as String,
      pricingModel: json['pricing_model'] as String,
      );
}
