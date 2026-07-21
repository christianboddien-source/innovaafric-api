-- Imágenes y descuentos del catálogo.
-- Los productos no tenían foto y no había forma de marcar ofertas (la pestaña
-- "Ofertas" de la app se quedaba vacía). Columnas nuevas, todas opcionales.

ALTER TABLE "Product"        ADD COLUMN "discountPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GroceryProduct" ADD COLUMN "imageUrl"    TEXT;

-- Imágenes reales para los productos de XenderShop
UPDATE "Product" SET "imageUrl" = 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=300&fit=crop' WHERE "id" = 'prod_001'; -- smartphone
UPDATE "Product" SET "imageUrl" = 'https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=400&h=300&fit=crop' WHERE "id" = 'prod_002'; -- ventilador solar
UPDATE "Product" SET "imageUrl" = 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=300&fit=crop' WHERE "id" = 'prod_003'; -- mochila
UPDATE "Product" SET "imageUrl" = 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=300&fit=crop' WHERE "id" = 'prod_004'; -- auriculares
UPDATE "Product" SET "imageUrl" = 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&h=300&fit=crop' WHERE "id" = 'prod_005'; -- kit solar

-- Un par de ofertas reales para que la pestaña "Ofertas" tenga contenido
UPDATE "Product" SET "discountPct" = 15 WHERE "id" = 'prod_004'; -- auriculares -15%
UPDATE "Product" SET "discountPct" = 20 WHERE "id" = 'prod_002'; -- ventilador solar -20%

-- Imágenes para los productos de BigShop
UPDATE "GroceryProduct" SET "imageUrl" = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop' WHERE "id" = 'groc_001'; -- arroz
UPDATE "GroceryProduct" SET "imageUrl" = 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=300&fit=crop' WHERE "id" = 'groc_002'; -- aceite
UPDATE "GroceryProduct" SET "imageUrl" = 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop' WHERE "id" = 'groc_003'; -- tomates
UPDATE "GroceryProduct" SET "imageUrl" = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=300&fit=crop' WHERE "id" = 'groc_004'; -- leche
