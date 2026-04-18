DO $$
BEGIN
  ALTER TYPE "ActionType" ADD VALUE 'ARCHIVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ActionType" ADD VALUE 'RESTORE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'IN_SERVICE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'UNDER_REPAIR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'TRANSFER_PENDING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'ARCHIVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'INACTIVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'DISPOSED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "VehicleStatus" ADD VALUE 'DAMAGED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "NotificationType" AS ENUM (
  'INVITATION',
  'SUPPORT',
  'REMINDER',
  'APPROVAL',
  'VEHICLE',
  'INCIDENT',
  'MAINTENANCE',
  'DOCUMENT',
  'SYSTEM'
);

CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "Vehicle"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "VehicleDocument"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "VehicleMaintenanceRecord"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "SystemLog"
  ADD COLUMN "companyId" TEXT;

CREATE TABLE "AppNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
  "entityType" "SystemEntityType",
  "entityId" TEXT,
  "link" TEXT,
  "metadata" JSONB,
  "sourceKey" TEXT,
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppNotification_sourceKey_key" ON "AppNotification"("sourceKey");
CREATE INDEX "AppNotification_userId_status_createdAt_idx" ON "AppNotification"("userId", "status", "createdAt");
CREATE INDEX "AppNotification_userId_archivedAt_idx" ON "AppNotification"("userId", "archivedAt");
CREATE INDEX "AppNotification_companyId_createdAt_idx" ON "AppNotification"("companyId", "createdAt");
CREATE INDEX "AppNotification_type_priority_idx" ON "AppNotification"("type", "priority");
CREATE INDEX "Vehicle_companyId_archivedAt_idx" ON "Vehicle"("companyId", "archivedAt");
CREATE INDEX "VehicleDocument_vehicleId_archivedAt_idx" ON "VehicleDocument"("vehicleId", "archivedAt");
CREATE INDEX "VehicleMaintenanceRecord_vehicleId_archivedAt_idx" ON "VehicleMaintenanceRecord"("vehicleId", "archivedAt");
CREATE INDEX "SystemLog_companyId_timestamp_idx" ON "SystemLog"("companyId", "timestamp");

ALTER TABLE "AppNotification"
  ADD CONSTRAINT "AppNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Vehicle"
SET
  "archivedAt" = COALESCE("archivedAt", "deletedAt"),
  "status" = CASE
    WHEN "deletedAt" IS NOT NULL THEN 'ARCHIVED'::"VehicleStatus"
    ELSE "status"
  END
WHERE "deletedAt" IS NOT NULL;

UPDATE "SystemLog"
SET "companyId" = COALESCE(
  "companyId",
  NULLIF("metadata" ->> 'companyId', ''),
  NULLIF("metadata" ->> 'toCompanyId', ''),
  NULLIF("metadata" ->> 'fromCompanyId', '')
)
WHERE "metadata" IS NOT NULL;
