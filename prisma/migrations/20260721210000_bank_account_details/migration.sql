-- Cuentas bancarias del cliente: el formulario de la app recoge más datos
-- (ciudad, divisa, teléfono, dirección, referencia y emoji) de los que cabían
-- en el modelo. Todas las columnas son opcionales: no afecta a las filas existentes.

ALTER TABLE "UserBankAccount" ADD COLUMN "city"          TEXT;
ALTER TABLE "UserBankAccount" ADD COLUMN "currency"      TEXT;
ALTER TABLE "UserBankAccount" ADD COLUMN "holderPhone"   TEXT;
ALTER TABLE "UserBankAccount" ADD COLUMN "holderAddress" TEXT;
ALTER TABLE "UserBankAccount" ADD COLUMN "reference"     TEXT;
ALTER TABLE "UserBankAccount" ADD COLUMN "emoji"         TEXT;
