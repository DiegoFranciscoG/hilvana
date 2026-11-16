// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato shopify.customers/redact. No editar a mano.

class ShopifyCustomersRedact {
  final ShopifyCustomersRedactCustomer customer;
  final List<int> ordersToRedact;
  final String shopDomain;
  final int shopId;
  const ShopifyCustomersRedact({required this.customer, required this.ordersToRedact, required this.shopDomain, required this.shopId});
  factory ShopifyCustomersRedact.fromJson(Map<String, dynamic> json) => ShopifyCustomersRedact(
      customer: ShopifyCustomersRedactCustomer.fromJson(json['customer'] as Map<String, dynamic>),
      ordersToRedact: (json['orders_to_redact'] as List<dynamic>).map((v) => (v as num).toInt()).toList(),
      shopDomain: json['shop_domain'] as String,
      shopId: (json['shop_id'] as num).toInt(),
      );
}

class ShopifyCustomersRedactCustomer {
  final String email;
  final int id;
  final String phone;
  const ShopifyCustomersRedactCustomer({required this.email, required this.id, required this.phone});
  factory ShopifyCustomersRedactCustomer.fromJson(Map<String, dynamic> json) => ShopifyCustomersRedactCustomer(
      email: json['email'] as String,
      id: (json['id'] as num).toInt(),
      phone: json['phone'] as String,
      );
}
