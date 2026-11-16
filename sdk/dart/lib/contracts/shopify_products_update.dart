// SPDX-License-Identifier: MIT
// Generado por el laboratorio de contratos de Hilvana desde el contrato shopify.products/update. No editar a mano.

class ShopifyProductsUpdate {
  final String adminGraphqlApiId;
  final String bodyHtml;
  final String handle;
  final int id;
  final String status;
  final String title;
  final String updatedAt;
  final List<ShopifyProductsUpdateVariantsItem> variants;
  const ShopifyProductsUpdate({required this.adminGraphqlApiId, required this.bodyHtml, required this.handle, required this.id, required this.status, required this.title, required this.updatedAt, required this.variants});
  factory ShopifyProductsUpdate.fromJson(Map<String, dynamic> json) => ShopifyProductsUpdate(
      adminGraphqlApiId: json['admin_graphql_api_id'] as String,
      bodyHtml: json['body_html'] as String,
      handle: json['handle'] as String,
      id: (json['id'] as num).toInt(),
      status: json['status'] as String,
      title: json['title'] as String,
      updatedAt: json['updated_at'] as String,
      variants: (json['variants'] as List<dynamic>).map((v) => ShopifyProductsUpdateVariantsItem.fromJson(v as Map<String, dynamic>)).toList(),
      );
}

class ShopifyProductsUpdateVariantsItem {
  final int id;
  final int inventoryQuantity;
  final String price;
  final String sku;
  final String title;
  const ShopifyProductsUpdateVariantsItem({required this.id, required this.inventoryQuantity, required this.price, required this.sku, required this.title});
  factory ShopifyProductsUpdateVariantsItem.fromJson(Map<String, dynamic> json) => ShopifyProductsUpdateVariantsItem(
      id: (json['id'] as num).toInt(),
      inventoryQuantity: (json['inventory_quantity'] as num).toInt(),
      price: json['price'] as String,
      sku: json['sku'] as String,
      title: json['title'] as String,
      );
}
