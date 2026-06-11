-- PIN de seguridad para operaciones de dinero en las apps
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
