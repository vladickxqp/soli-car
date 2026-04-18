import { Prisma, PrismaClient, SystemEntityType } from "@prisma/client";

type LogDbClient = PrismaClient | Prisma.TransactionClient;

interface SystemLogInput {
  userId?: string | null;
  companyId?: string | null;
  action: string;
  entityType: SystemEntityType;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

const toJson = (value: unknown): Prisma.InputJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

export const createSystemLog = async (db: LogDbClient, input: SystemLogInput) => {
  await db.systemLog.create({
    data: {
      userId: input.userId ?? null,
      companyId: input.companyId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
};

export const createSystemLogFromUnknown = async (
  db: LogDbClient,
  input: Omit<SystemLogInput, "metadata"> & { metadata?: unknown },
) => {
  const metadataRecord =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;

  await createSystemLog(db, {
    ...input,
    companyId:
      input.companyId ??
      (typeof metadataRecord?.companyId === "string"
        ? metadataRecord.companyId
        : typeof metadataRecord?.toCompanyId === "string"
          ? metadataRecord.toCompanyId
          : typeof metadataRecord?.fromCompanyId === "string"
            ? metadataRecord.fromCompanyId
            : null),
    metadata: toJson(input.metadata),
  });
};
