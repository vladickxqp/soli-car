-- CreateEnum
CREATE TYPE "VehicleDamageStatus" AS ENUM ('NONE', 'REPORTED', 'UNDER_REPAIR', 'REPAIRED');

-- CreateEnum
CREATE TYPE "VehicleIncidentStatus" AS ENUM ('UNRESOLVED', 'REPAIRED');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'INCIDENT';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "registrationType" "RegistrationType" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "Vehicle"
ADD COLUMN "hadPreviousAccidents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "damageStatus" "VehicleDamageStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "damageNotes" TEXT;

-- AlterTable
ALTER TABLE "SupportTicket"
ADD COLUMN "vehicleId" TEXT,
ADD COLUMN "vehicleIncidentId" TEXT;

-- CreateTable
CREATE TABLE "VehicleIncident" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "VehicleIncidentStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "repairedAt" TIMESTAMP(3),
    "repairNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_isPlatformAdmin_deletedAt_idx" ON "User"("isPlatformAdmin", "deletedAt");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_damageStatus_idx" ON "Vehicle"("companyId", "damageStatus");

-- CreateIndex
CREATE INDEX "SupportTicket_vehicleId_idx" ON "SupportTicket"("vehicleId");

-- CreateIndex
CREATE INDEX "SupportTicket_vehicleIncidentId_idx" ON "SupportTicket"("vehicleIncidentId");

-- CreateIndex
CREATE INDEX "VehicleIncident_vehicleId_status_idx" ON "VehicleIncident"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "VehicleIncident_vehicleId_occurredAt_idx" ON "VehicleIncident"("vehicleId", "occurredAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_vehicleIncidentId_fkey" FOREIGN KEY ("vehicleIncidentId") REFERENCES "VehicleIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIncident" ADD CONSTRAINT "VehicleIncident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
