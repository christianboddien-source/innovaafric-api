-- App del Comercio: estado Abierto/Cerrado autogestionado por el comercio

ALTER TABLE "Merchant" ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;
