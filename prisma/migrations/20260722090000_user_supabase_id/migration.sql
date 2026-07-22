-- UUID de Supabase en el usuario de Railway.
-- El id de Railway es "usr_<primeros8delUUID>", que no coincide con la columna
-- user_id (UUID) de la tabla wallets de Supabase, así que el sync Railway→Supabase
-- nunca encontraba la fila. Guardamos el UUID completo para poder sincronizar.

ALTER TABLE "User" ADD COLUMN "supabaseId" TEXT;
CREATE UNIQUE INDEX "User_supabaseId_key" ON "User"("supabaseId");
