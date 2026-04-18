import { vi } from "vitest";

export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  },
  company: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
  },
  vehicle: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  vehicleIncident: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  companyInvitation: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  vehicleDocument: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  vehicleMaintenanceRecord: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
  vehicleHistory: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  supportTicket: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  ticketMessage: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  approvalRequest: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  passwordResetToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  emailVerificationToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  userSession: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  appNotification: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  systemLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  vehiclePublicShareLink: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

export const resetPrismaMock = () => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findMany.mockReset();
  prismaMock.user.create.mockReset();
  prismaMock.user.update.mockReset();
  prismaMock.user.count.mockReset();
  prismaMock.user.upsert.mockReset();

  prismaMock.company.findUnique.mockReset();
  prismaMock.company.findMany.mockReset();
  prismaMock.company.count.mockReset();
  prismaMock.company.create.mockReset();
  prismaMock.company.update.mockReset();
  prismaMock.company.delete.mockReset();
  prismaMock.company.upsert.mockReset();

  prismaMock.vehicle.findUnique.mockReset();
  prismaMock.vehicle.findFirst.mockReset();
  prismaMock.vehicle.findMany.mockReset();
  prismaMock.vehicle.create.mockReset();
  prismaMock.vehicle.update.mockReset();
  prismaMock.vehicle.count.mockReset();
  prismaMock.vehicle.groupBy.mockReset();

  prismaMock.vehicleIncident.findFirst.mockReset();
  prismaMock.vehicleIncident.create.mockReset();
  prismaMock.vehicleIncident.update.mockReset();

  prismaMock.companyInvitation.findUnique.mockReset();
  prismaMock.companyInvitation.findFirst.mockReset();
  prismaMock.companyInvitation.create.mockReset();
  prismaMock.companyInvitation.update.mockReset();

  prismaMock.vehicleDocument.findUnique.mockReset();
  prismaMock.vehicleDocument.findFirst.mockReset();
  prismaMock.vehicleDocument.findMany.mockReset();
  prismaMock.vehicleDocument.create.mockReset();
  prismaMock.vehicleDocument.update.mockReset();
  prismaMock.vehicleDocument.delete.mockReset();

  prismaMock.vehicleMaintenanceRecord.findUnique.mockReset();
  prismaMock.vehicleMaintenanceRecord.findMany.mockReset();
  prismaMock.vehicleMaintenanceRecord.create.mockReset();
  prismaMock.vehicleMaintenanceRecord.update.mockReset();
  prismaMock.vehicleMaintenanceRecord.delete.mockReset();
  prismaMock.vehicleMaintenanceRecord.aggregate.mockReset();

  prismaMock.vehicleHistory.create.mockReset();
  prismaMock.vehicleHistory.findMany.mockReset();

  prismaMock.supportTicket.findMany.mockReset();
  prismaMock.supportTicket.findFirst.mockReset();
  prismaMock.supportTicket.findUnique.mockReset();
  prismaMock.supportTicket.create.mockReset();
  prismaMock.supportTicket.update.mockReset();
  prismaMock.supportTicket.count.mockReset();

  prismaMock.ticketMessage.findUnique.mockReset();
  prismaMock.ticketMessage.create.mockReset();

  prismaMock.approvalRequest.findUnique.mockReset();
  prismaMock.approvalRequest.findMany.mockReset();
  prismaMock.approvalRequest.create.mockReset();
  prismaMock.approvalRequest.update.mockReset();
  prismaMock.approvalRequest.count.mockReset();

  prismaMock.passwordResetToken.findUnique.mockReset();
  prismaMock.passwordResetToken.create.mockReset();
  prismaMock.passwordResetToken.update.mockReset();
  prismaMock.passwordResetToken.updateMany.mockReset();

  prismaMock.emailVerificationToken.findUnique.mockReset();
  prismaMock.emailVerificationToken.create.mockReset();
  prismaMock.emailVerificationToken.update.mockReset();
  prismaMock.emailVerificationToken.updateMany.mockReset();

  prismaMock.userSession.findUnique.mockReset();
  prismaMock.userSession.findMany.mockReset();
  prismaMock.userSession.create.mockReset();
  prismaMock.userSession.update.mockReset();
  prismaMock.userSession.updateMany.mockReset();

  prismaMock.appNotification.findUnique.mockReset();
  prismaMock.appNotification.findMany.mockReset();
  prismaMock.appNotification.create.mockReset();
  prismaMock.appNotification.update.mockReset();
  prismaMock.appNotification.updateMany.mockReset();
  prismaMock.appNotification.count.mockReset();

  prismaMock.systemLog.create.mockReset();
  prismaMock.systemLog.findMany.mockReset();
  prismaMock.systemLog.count.mockReset();

  prismaMock.vehiclePublicShareLink.findUnique.mockReset();
  prismaMock.vehiclePublicShareLink.findMany.mockReset();
  prismaMock.vehiclePublicShareLink.create.mockReset();
  prismaMock.vehiclePublicShareLink.update.mockReset();
  prismaMock.vehiclePublicShareLink.updateMany.mockReset();

  prismaMock.subscription.findUnique.mockReset();
  prismaMock.subscription.findFirst.mockReset();
  prismaMock.subscription.create.mockReset();
  prismaMock.subscription.upsert.mockReset();

  prismaMock.$queryRaw.mockReset();
  prismaMock.$transaction.mockReset();
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.company.findMany.mockResolvedValue([]);
  prismaMock.vehicle.findMany.mockResolvedValue([]);
  prismaMock.vehicleDocument.findMany.mockResolvedValue([]);
  prismaMock.vehicleMaintenanceRecord.findMany.mockResolvedValue([]);
  prismaMock.supportTicket.findMany.mockResolvedValue([]);
  prismaMock.approvalRequest.findMany.mockResolvedValue([]);
  prismaMock.systemLog.findMany.mockResolvedValue([]);
  prismaMock.appNotification.findMany.mockResolvedValue([]);
  prismaMock.userSession.findMany.mockResolvedValue([]);
  prismaMock.vehiclePublicShareLink.findMany.mockResolvedValue([]);
  prismaMock.userSession.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.vehiclePublicShareLink.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.vehicle.count.mockResolvedValue(0);
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.company.count.mockResolvedValue(0);
  prismaMock.supportTicket.count.mockResolvedValue(0);
  prismaMock.approvalRequest.count.mockResolvedValue(0);
  prismaMock.systemLog.count.mockResolvedValue(0);
  prismaMock.appNotification.count.mockResolvedValue(0);
  prismaMock.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.appNotification.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
};
