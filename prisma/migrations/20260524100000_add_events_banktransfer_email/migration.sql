-- CreateTable: Event
CREATE TABLE "Event" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "type"        TEXT NOT NULL DEFAULT 'announcement',
    "startDate"   TIMESTAMP(3) NOT NULL,
    "endDate"     TIMESTAMP(3),
    "allDay"      BOOLEAN NOT NULL DEFAULT true,
    "country"     TEXT,
    "city"        TEXT,
    "color"       TEXT NOT NULL DEFAULT '#00AEEF',
    "createdBy"   TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BankTransfer
CREATE TABLE "BankTransfer" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "amount"        DOUBLE PRECISION NOT NULL,
    "currency"      TEXT NOT NULL DEFAULT 'XAF',
    "bankName"      TEXT NOT NULL,
    "accountName"   TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "swiftCode"     TEXT,
    "ibanCode"      TEXT,
    "country"       TEXT NOT NULL,
    "reference"     TEXT,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "notes"         TEXT,
    "processedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmailLog
CREATE TABLE "EmailLog" (
    "id"         TEXT NOT NULL,
    "toFilter"   TEXT NOT NULL,
    "subject"    TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'info',
    "sentBy"     TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "status"     TEXT NOT NULL DEFAULT 'sent',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: BankTransfer → User
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
