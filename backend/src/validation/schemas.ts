import { z } from "zod";
import { sanitizeInlineText, sanitizeMultilineText } from "../utils/sanitize.js";

const USER_ROLES = ["ADMIN", "MANAGER", "VIEWER"] as const;
const REGISTRATION_TYPES = ["COMPANY", "INDIVIDUAL"] as const;
const VEHICLE_STATUSES = [
  "ACTIVE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "TRANSFER_PENDING",
  "ARCHIVED",
  "INACTIVE",
  "DISPOSED",
  "DAMAGED",
  "IN_LEASING",
  "SOLD",
  "MAINTENANCE",
  "TRANSFERRED",
] as const;
const VEHICLE_DAMAGE_STATUSES = ["NONE", "REPORTED", "UNDER_REPAIR", "REPAIRED"] as const;
const VEHICLE_INCIDENT_STATUSES = ["UNRESOLVED", "REPAIRED"] as const;
const VEHICLE_DOCUMENT_TYPES = ["REGISTRATION", "INSURANCE", "CONTRACT", "SERVICE", "INCIDENT", "PHOTO", "OTHER"] as const;
const MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"] as const;
const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const TICKET_CATEGORIES = ["TECHNICAL", "BILLING", "OTHER"] as const;
const SYSTEM_ENTITY_TYPES = ["VEHICLE", "USER", "COMPANY", "TICKET", "INVITATION", "DOCUMENT", "MAINTENANCE", "APPROVAL"] as const;
const SUBSCRIPTION_PLANS = ["FREE", "PRO", "ENTERPRISE"] as const;
const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const APPROVAL_ACTIONS = [
  "ADMIN_USER_CREATE",
  "ADMIN_USER_UPDATE",
  "ADMIN_USER_DELETE",
  "ADMIN_USER_PASSWORD_RESET",
  "ADMIN_COMPANY_DELETE",
  "ADMIN_VEHICLE_TRANSFER",
  "ADMIN_VEHICLE_DELETE",
] as const;
const REMINDER_TYPES = ["TUV", "INSURANCE", "CONTRACT", "MAINTENANCE", "DOCUMENT"] as const;
const REMINDER_STATES = ["UPCOMING", "DUE", "OVERDUE"] as const;
const NOTIFICATION_TYPES = ["INVITATION", "SUPPORT", "REMINDER", "APPROVAL", "VEHICLE", "INCIDENT", "MAINTENANCE", "DOCUMENT", "SYSTEM"] as const;
const NOTIFICATION_STATUSES = ["UNREAD", "READ", "ARCHIVED"] as const;
const NOTIFICATION_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(160);

const passwordField = z
  .string()
  .min(8)
  .max(128);

const safeText = (min: number, max: number) =>
  z
    .string()
    .transform(sanitizeInlineText)
    .refine((value) => value.length >= min, { message: `Must be at least ${min} characters long` })
    .refine((value) => value.length <= max, { message: `Must be at most ${max} characters long` });

const optionalSafeText = (max: number) =>
  z
    .union([z.string(), z.literal("")])
    .optional()
    .transform((value) => sanitizeInlineText(value ?? ""))
    .refine((value) => value.length <= max, { message: `Must be at most ${max} characters long` })
    .transform((value) => value || undefined);

const multilineText = (min: number, max: number) =>
  z
    .string()
    .transform(sanitizeMultilineText)
    .refine((value) => value.length >= min, { message: `Must be at least ${min} characters long` })
    .refine((value) => value.length <= max, { message: `Must be at most ${max} characters long` });

const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid date format",
});

const numericString = z.string().refine((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}, {
  message: "Invalid number format",
});

const optionalUrl = z
  .union([z.string().url(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  registrationType: z.enum(REGISTRATION_TYPES),
  companyName: optionalSafeText(120),
  invitationToken: optionalSafeText(255),
}).superRefine((value, ctx) => {
  if (value.registrationType === "COMPANY" && !value.companyName && !value.invitationToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companyName"],
      message: "Company name is required for company registration",
    });
  }
});

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
});

export const changePasswordSchema = z.object({
  currentPassword: passwordField,
  newPassword: passwordField,
}).refine((value) => value.currentPassword !== value.newPassword, {
  path: ["newPassword"],
  message: "New password must be different from current password",
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resendVerificationSchema = z.object({
  email: emailField,
});

export const verifyEmailSchema = z.object({
  token: safeText(20, 255),
});

export const resetPasswordSchema = z.object({
  token: safeText(20, 255),
  password: passwordField,
});

export const onboardingCompletionSchema = z.object({
  preferredLanguage: z.enum(["en", "de", "ru"]).optional(),
  preferredTheme: z.enum(["light", "dark"]).optional(),
  preferredVehicleView: z.enum(["table", "cards"]).optional(),
});

const vehicleIncidentSchema = z.object({
  id: z.string().uuid().optional(),
  title: safeText(2, 120),
  description: multilineText(3, 2000),
  status: z.enum(VEHICLE_INCIDENT_STATUSES),
  occurredAt: dateString,
  repairedAt: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
  repairNotes: z.union([z.string(), z.literal("")]).optional().transform((value) => sanitizeMultilineText(value ?? "")),
}).superRefine((value, ctx) => {
  if (value.status === "UNRESOLVED" && value.repairedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repairedAt"],
      message: "Unresolved incidents cannot have a repaired date",
    });
  }

  if (value.status === "REPAIRED" && !value.repairedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repairedAt"],
      message: "Repaired incidents require a repaired date",
    });
  }

  if (value.repairNotes && value.repairNotes.length > 2000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repairNotes"],
      message: "Repair notes must be at most 2000 characters long",
    });
  }
});

export const vehicleSchema = z.object({
  model: safeText(1, 120),
  firstRegistration: dateString,
  vin: safeText(1, 80),
  hsn: safeText(1, 40),
  tsn: safeText(1, 40),
  price: numericString,
  tuvDate: dateString,
  tireStorage: optionalSafeText(120).default(""),
  plate: safeText(1, 40),
  lastUpdate: dateString,
  driver: safeText(1, 120),
  contractType: safeText(1, 80),
  contractValue: numericString,
  interest: numericString,
  contractStart: dateString,
  contractEnd: dateString,
  leasingPartner: safeText(1, 120),
  customerNumber: safeText(1, 80),
  inventoryNumber: safeText(1, 80),
  contractPartner: safeText(1, 120),
  billingFrom: dateString,
  leasingRate: numericString,
  billedTo: dateString,
  insurancePartner: safeText(1, 120),
  insuranceNumber: safeText(1, 80),
  insuranceCost: numericString,
  insuranceStart: dateString,
  insuranceEnd: dateString,
  mileage: z.number().int().nonnegative(),
  yearlyMileage: z.number().int().nonnegative(),
  taxPerYear: numericString,
  paymentDate: dateString,
  status: z.enum(VEHICLE_STATUSES).optional().default("ACTIVE"),
  hadPreviousAccidents: z.boolean().optional().default(false),
  damageStatus: z.enum(VEHICLE_DAMAGE_STATUSES).optional().default("NONE"),
  damageNotes: z.union([z.string(), z.literal("")]).optional().transform((value) => sanitizeMultilineText(value ?? "")),
  incidents: z.array(vehicleIncidentSchema).max(25).optional().default([]),
  imageUrl: optionalUrl,
  companyId: optionalUuid,
}).superRefine((value, ctx) => {
  if (value.incidents.length > 0 && value.damageStatus === "NONE") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["damageStatus"],
      message: "Damage status must be set when incidents exist",
    });
  }

  if (value.incidents.some((incident) => incident.status === "UNRESOLVED") && value.damageStatus === "REPAIRED") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["damageStatus"],
      message: "Damage status cannot be repaired while unresolved incidents exist",
    });
  }
});

export const transferSchema = z.object({
  companyId: z.string().uuid(),
});

export const statusSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
});

export const adminUserCreateSchema = z.object({
  email: emailField,
  password: passwordField,
  role: z.enum(USER_ROLES),
  companyId: z.string().uuid(),
  isPlatformAdmin: z.boolean().optional().default(false),
});

export const adminUserUpdateSchema = z.object({
  email: emailField,
  role: z.enum(USER_ROLES),
  companyId: z.string().uuid(),
  isPlatformAdmin: z.boolean().optional().default(false),
});

export const adminUserResetPasswordSchema = z.object({
  password: passwordField,
});

export const adminCompanyCreateSchema = z.object({
  name: safeText(2, 120),
});

export const adminCompanyUpdateSchema = z.object({
  name: safeText(2, 120),
});

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: optionalSafeText(120),
  role: z.enum(USER_ROLES).optional(),
  companyId: z.string().uuid().optional(),
});

export const adminCompaniesQuerySchema = paginationQuerySchema.extend({
  search: optionalSafeText(120),
});

export const companyInvitationCreateSchema = z.object({
  email: emailField,
  role: z.enum(USER_ROLES),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const companyInvitationsQuerySchema = z.object({
  status: z.enum(INVITATION_STATUSES).optional(),
});

export const invitationPreviewParamsSchema = z.object({
  token: safeText(10, 255),
});

export const vehicleDocumentCreateSchema = z.object({
  title: safeText(2, 120),
  documentType: z.enum(VEHICLE_DOCUMENT_TYPES),
  expiryDate: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
  incidentId: optionalUuid,
});

export const publicVehicleShareCreateSchema = z.object({
  label: optionalSafeText(120),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const maintenanceRecordSchema = z.object({
  title: safeText(2, 120),
  description: optionalSafeText(2000),
  status: z.enum(MAINTENANCE_STATUSES).default("SCHEDULED"),
  serviceDate: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
  completedAt: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
  cost: z.union([numericString, z.literal("")]).optional().transform((value) => value || undefined),
  vendor: optionalSafeText(120),
  mileage: z.coerce.number().int().nonnegative().optional(),
  reminderDate: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
}).superRefine((value, ctx) => {
  if (value.status === "COMPLETED" && !value.completedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "Completed maintenance records require a completion date",
    });
  }

  if (value.status !== "COMPLETED" && value.completedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "Only completed maintenance records can include a completion date",
    });
  }
});

export const adminTicketsQuerySchema = paginationQuerySchema.extend({
  search: optionalSafeText(120),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  companyId: z.string().uuid().optional(),
});

export const adminLogsQuerySchema = paginationQuerySchema.extend({
  search: optionalSafeText(120),
  entityType: z.enum([...SYSTEM_ENTITY_TYPES, "APPROVAL"] as const).optional(),
  action: optionalSafeText(120),
});

export const approvalCreateSchema = z.object({
  reason: optionalSafeText(500),
});

export const approvalDecisionSchema = z.object({
  reviewComment: optionalSafeText(500),
});

export const approvalsQuerySchema = paginationQuerySchema.extend({
  search: optionalSafeText(120),
  status: z.enum(APPROVAL_STATUSES).optional(),
  action: z.enum(APPROVAL_ACTIONS).optional(),
  companyId: z.string().uuid().optional(),
});

export const remindersQuerySchema = z.object({
  companyId: optionalUuid,
  type: z.enum(REMINDER_TYPES).optional(),
  state: z.enum(REMINDER_STATES).optional(),
});

export const notificationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
});

export const activityQuerySchema = paginationQuerySchema.extend({
  companyId: optionalUuid,
  entityType: z.enum(SYSTEM_ENTITY_TYPES).optional(),
  userId: optionalUuid,
  search: optionalSafeText(120),
  dateFrom: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
  dateTo: z.union([dateString, z.literal("")]).optional().transform((value) => value || undefined),
});

export const archiveActionSchema = z.object({
  reason: optionalSafeText(500),
});

export const vehicleRestoreSchema = z.object({
  status: z.enum(VEHICLE_STATUSES).optional(),
});

export const billingQuerySchema = z.object({
  companyId: optionalUuid,
});

export const billingManageSchema = z.object({
  plan: z.enum(SUBSCRIPTION_PLANS),
  companyId: optionalUuid,
});

export const analyticsQuerySchema = z.object({
  companyId: optionalUuid,
});

export const vehicleLocationQuerySchema = z.object({
  companyId: optionalUuid,
  search: optionalSafeText(120),
  status: z.enum(VEHICLE_STATUSES).optional(),
});

export const vehicleLocationUpdateSchema = z.object({
  vehicleId: z.string().uuid(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  lastLocationUpdate: dateString.optional(),
});

export const supportTicketCreateSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  message: multilineText(3, 4000),
  vehicleId: optionalUuid,
  vehicleIncidentId: optionalUuid,
}).superRefine((value, ctx) => {
  if (value.vehicleIncidentId && !value.vehicleId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleId"],
      message: "Vehicle is required when referencing an incident",
    });
  }
});

export const supportTicketMessageSchema = z.object({
  message: multilineText(1, 4000),
});

export const adminTicketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
}).refine((value) => value.status || value.priority, {
  message: "Provide at least one ticket field to update",
});
