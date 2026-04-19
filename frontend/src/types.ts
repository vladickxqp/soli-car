export type UserRole = "ADMIN" | "MANAGER" | "VIEWER";
export type RegistrationType = "COMPANY" | "INDIVIDUAL";
export type SubscriptionPlan = "FREE" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE";
export type VehicleDamageStatus = "NONE" | "REPORTED" | "UNDER_REPAIR" | "REPAIRED";
export type VehicleIncidentStatus = "UNRESOLVED" | "REPAIRED";

export type VehicleStatus =
  | "ACTIVE"
  | "IN_SERVICE"
  | "UNDER_REPAIR"
  | "TRANSFER_PENDING"
  | "ARCHIVED"
  | "INACTIVE"
  | "DISPOSED"
  | "DAMAGED"
  | "IN_LEASING"
  | "SOLD"
  | "MAINTENANCE"
  | "TRANSFERRED";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH";
export type TicketCategory = "TECHNICAL" | "BILLING" | "OTHER";
export type SystemEntityType = "VEHICLE" | "USER" | "COMPANY" | "TICKET" | "INVITATION" | "DOCUMENT" | "MAINTENANCE" | "APPROVAL";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type VehicleDocumentType = "REGISTRATION" | "INSURANCE" | "CONTRACT" | "SERVICE" | "INCIDENT" | "PHOTO" | "OTHER";
export type MaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type NotificationType = "INVITATION" | "SUPPORT" | "REMINDER" | "APPROVAL" | "VEHICLE" | "INCIDENT" | "MAINTENANCE" | "DOCUMENT" | "SYSTEM";
export type NotificationStatus = "UNREAD" | "READ" | "ARCHIVED";
export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH";
export type ApprovalAction =
  | "ADMIN_USER_CREATE"
  | "ADMIN_USER_UPDATE"
  | "ADMIN_USER_DELETE"
  | "ADMIN_USER_PASSWORD_RESET"
  | "ADMIN_COMPANY_DELETE"
  | "ADMIN_VEHICLE_TRANSFER"
  | "ADMIN_VEHICLE_DELETE";
export type ReminderType = "TUV" | "INSURANCE" | "CONTRACT" | "MAINTENANCE" | "DOCUMENT";
export type ReminderState = "UPCOMING" | "DUE" | "OVERDUE";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  isPlatformAdmin: boolean;
  registrationType: RegistrationType;
  emailVerifiedAt?: string | null;
  onboardingCompletedAt?: string | null;
  sessionId?: string | null;
}

export interface AuthData {
  token: string;
  user: AuthUser;
}

export interface VerificationRequiredResponse {
  success: true;
  requiresEmailVerification: true;
  email: string;
  deliveryMode?: "smtp" | "log" | "failed" | null;
  previewUrl?: string | null;
}

export interface VerificationDeliveryResponse {
  success: true;
  deliveryMode?: "smtp" | "log" | "failed" | null;
  previewUrl?: string | null;
}

export interface UserSessionRecord {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  isCurrent: boolean;
}

export interface InvitationPreview {
  id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  company: Company;
  inviter?: {
    email: string;
  } | null;
}

export interface VehiclePayload {
  model: string;
  firstRegistration: string;
  vin: string;
  hsn: string;
  tsn: string;
  price: string;
  tuvDate: string;
  tireStorage: string;
  plate: string;
  lastUpdate: string;
  driver: string;
  contractType: string;
  contractValue: string;
  interest: string;
  contractStart: string;
  contractEnd: string;
  leasingPartner: string;
  customerNumber: string;
  inventoryNumber: string;
  contractPartner: string;
  billingFrom: string;
  leasingRate: string;
  billedTo: string;
  insurancePartner: string;
  insuranceNumber: string;
  insuranceCost: string;
  insuranceStart: string;
  insuranceEnd: string;
  mileage: number;
  yearlyMileage: number;
  taxPerYear: string;
  paymentDate: string;
  status: VehicleStatus;
  hadPreviousAccidents: boolean;
  damageStatus: VehicleDamageStatus;
  damageNotes?: string;
  incidents: VehicleIncidentPayload[];
  imageUrl?: string;
  companyId?: string;
}

export interface VehicleIncidentPayload {
  id?: string;
  title: string;
  description: string;
  status: VehicleIncidentStatus;
  occurredAt: string;
  repairedAt?: string;
  repairNotes?: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  isPlatformAdmin?: boolean;
  registrationType?: RegistrationType;
  createdAt?: string;
  updatedAt?: string;
  company?: Company;
}

export interface VehicleIncident {
  id: string;
  title: string;
  description: string;
  status: VehicleIncidentStatus;
  occurredAt: string;
  repairedAt?: string | null;
  repairNotes?: string | null;
  attachments: VehicleDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  incidentId?: string | null;
  title: string;
  documentType: VehicleDocumentType;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  expiryDate?: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id: string;
    email: string;
  } | null;
}

export interface VehiclePublicShareLink {
  id: string;
  label?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastAccessedAt?: string | null;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
  shareUrl?: string;
}

export interface VehicleMaintenanceRecord {
  id: string;
  vehicleId: string;
  title: string;
  description?: string | null;
  status: MaintenanceStatus;
  serviceDate?: string | null;
  completedAt?: string | null;
  cost?: number | null;
  vendor?: string | null;
  mileage?: number | null;
  reminderDate?: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    email: string;
  } | null;
  updatedBy?: {
    id: string;
    email: string;
  } | null;
}

export interface Vehicle {
  id: string;
  companyId: string;
  company?: Company;
  model: string;
  firstRegistration: string;
  vin: string;
  hsn: string;
  tsn: string;
  price: number;
  tuvDate: string;
  tireStorage: string;
  plate: string;
  lastUpdate: string;
  driver: string;
  contractType: string;
  contractValue: number;
  interest: number;
  contractStart: string;
  contractEnd: string;
  leasingPartner: string;
  customerNumber: string;
  inventoryNumber: string;
  contractPartner: string;
  billingFrom: string;
  leasingRate: number;
  billedTo: string;
  insurancePartner: string;
  insuranceNumber: string;
  insuranceCost: number;
  insuranceStart: string;
  insuranceEnd: string;
  mileage: number;
  yearlyMileage: number;
  taxPerYear: number;
  paymentDate: string;
  status: VehicleStatus;
  hadPreviousAccidents: boolean;
  damageStatus: VehicleDamageStatus;
  damageNotes?: string | null;
  imageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lastLocationUpdate?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  archiveReason?: string | null;
  incidents: VehicleIncident[];
  documents: VehicleDocument[];
  maintenanceRecords: VehicleMaintenanceRecord[];
  publicShareLinks?: VehiclePublicShareLink[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleListItem {
  id: string;
  companyId: string;
  company?: Company;
  model: string;
  vin: string;
  plate: string;
  driver: string;
  mileage: number;
  status: VehicleStatus;
  hadPreviousAccidents: boolean;
  damageStatus: VehicleDamageStatus;
  incidentCount?: number;
  imageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lastLocationUpdate?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  archiveReason?: string | null;
  updatedAt: string;
}

export interface VehicleLocationItem extends VehicleListItem {}

export interface VehicleHistory {
  id: string;
  actionType: "CREATE" | "UPDATE" | "TRANSFER" | "DELETE" | "STATUS" | "INCIDENT" | "DOCUMENT" | "MAINTENANCE" | "ARCHIVE" | "RESTORE";
  changedBy: {
    email: string;
  };
  oldData?: unknown;
  newData?: unknown;
  timestamp: string;
}

export interface DashboardNotification {
  id: string;
  type: "TUV" | "INSURANCE" | "CONTRACT" | "MAINTENANCE" | "DOCUMENT";
  severity: "green" | "yellow" | "red";
  title: string;
  dueDate: string;
  daysRemaining: number;
  vehicle: {
    id: string;
    model: string;
    plate: string;
    status: VehicleStatus;
    companyName: string;
  };
}

export interface DashboardSummary {
  totalVehicles: number;
  activeVehicles: number;
  inLeasingVehicles: number;
  soldVehicles: number;
  tuvExpiring: number;
  insuranceExpiring: number;
  contractEnding: number;
  notifications: DashboardNotification[];
}

export interface SubscriptionRecord {
  id: string;
  companyId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPlanOption {
  plan: SubscriptionPlan;
  name: string;
  vehicleLimit: number | null;
}

export interface BillingSummary {
  company: Company;
  billingMode: "stripe" | "mock";
  stripeEnabled: boolean;
  subscription: SubscriptionRecord;
  usage: {
    vehicleCount: number;
    vehicleLimit: number | null;
    remainingVehicles: number | null;
    limitExceeded: boolean;
  };
  plans: BillingPlanOption[];
}

export interface AdvancedAnalyticsSummary {
  totalVehicles: number;
  totalMileage: number;
  averageMileage: number;
  totalInsuranceCost: number;
  totalLeasingCost: number;
  totalCost: number;
  expiringTuvCount: number;
  expiringInsuranceCount: number;
  vehiclesWithAccidents: number;
  damagedVehicles: number;
  totalMaintenanceCost: number;
  upcomingServiceReminders: number;
}

export interface VehiclesPerCompanyPoint {
  companyId: string;
  companyName: string;
  vehicleCount: number;
  totalMileage: number;
  averageMileage: number;
  totalInsuranceCost: number;
  totalLeasingCost: number;
}

export interface StatusBreakdownPoint {
  status: VehicleStatus;
  count: number;
}

export interface VehiclesOverTimePoint {
  label: string;
  vehicles: number;
  cumulativeVehicles: number;
}

export interface CostsOverTimePoint {
  label: string;
  leasingCost: number;
  insuranceCost: number;
  taxCost: number;
  totalCost: number;
}

export interface MileageOverTimePoint {
  label: string;
  projectedMileage: number;
  averageMileage: number;
}

export interface MaintenanceOverTimePoint {
  label: string;
  events: number;
  cost: number;
}

export interface DamageBreakdownPoint {
  key: string;
  label: string;
  count: number;
}

export interface AdvancedAnalytics {
  summary: AdvancedAnalyticsSummary;
  vehiclesPerCompany: VehiclesPerCompanyPoint[];
  statusBreakdown: StatusBreakdownPoint[];
  vehiclesOverTime: VehiclesOverTimePoint[];
  costsOverTime: CostsOverTimePoint[];
  mileageOverTime: MileageOverTimePoint[];
  maintenanceOverTime: MaintenanceOverTimePoint[];
  damageBreakdown: DamageBreakdownPoint[];
  alerts: DashboardNotification[];
}

export interface GlobalSearchResult {
  id: string;
  model: string;
  plate: string;
  vin: string;
  driver: string;
  status: VehicleStatus;
  company: Company;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ImportVehiclesResult {
  imported: number;
  vehicles: Vehicle[];
}

export interface SupportTicketMessage {
  id: string;
  message: string;
  attachmentUrl?: string | null;
  timestamp: string;
  sender?: {
    id: string;
    email: string;
    role: UserRole;
  } | null;
}

export interface SupportTicket {
  id: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  company: Company;
  vehicle?: Pick<Vehicle, "id" | "model" | "plate" | "damageStatus"> | null;
  vehicleIncident?: Pick<VehicleIncident, "id" | "title" | "status" | "occurredAt"> | null;
  user?: {
    id: string;
    email: string;
    role: UserRole;
  } | null;
  messages: SupportTicketMessage[];
}

export interface AdminUser extends UserSummary {
  company: Company;
}

export interface AdminCompanyListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  vehicleCount: number;
  ticketCount: number;
  openTicketCount: number;
}

export interface AdminCompanyDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  users: UserSummary[];
  vehicles: VehicleListItem[];
}

export interface CompanyInvitation {
  id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  inviter?: {
    id: string;
    email: string;
  } | null;
  acceptUrl?: string;
}

export interface CompanyWorkspaceDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  users: UserSummary[];
  vehicles: VehicleListItem[];
  invitations: CompanyInvitation[];
}

export interface SystemLogEntry {
  id: string;
  action: string;
  entityType: SystemEntityType;
  entityId?: string | null;
  metadata?: unknown;
  timestamp: string;
  user?: {
    id: string;
    email: string;
  } | null;
}

export interface ApprovalRequest {
  id: string;
  companyId?: string | null;
  action: ApprovalAction;
  status: ApprovalStatus;
  entityType: SystemEntityType;
  entityId?: string | null;
  payload?: unknown;
  reason?: string | null;
  reviewComment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  company?: Company | null;
  requestedBy?: {
    id: string;
    email: string;
  } | null;
  reviewedBy?: {
    id: string;
    email: string;
  } | null;
}

export interface ApprovalActionResponse {
  action: "approval_requested";
  approval: ApprovalRequest;
}

export interface AppNotification {
  id: string;
  companyId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  priority: NotificationPriority;
  entityType?: SystemEntityType | null;
  entityId?: string | null;
  link?: string | null;
  metadata?: unknown;
  readAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationSummary {
  unreadCount: number;
  highPriorityUnreadCount: number;
  items: AppNotification[];
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  entityType: SystemEntityType;
  entityId?: string | null;
  companyId?: string | null;
  title: string;
  description: string;
  link?: string | null;
  timestamp: string;
  actor?: {
    id: string;
    email: string;
  } | null;
}

export interface ReminderItem {
  id: string;
  type: ReminderType;
  title: string;
  dueDate: string;
  daysRemaining: number;
  state: ReminderState;
  vehicle: {
    id: string;
    model: string;
    plate: string;
    status: VehicleStatus;
    companyId: string;
    companyName: string;
  };
}

export interface PublicVehicleSnapshot {
  shareLink: {
    id: string;
    label?: string | null;
    expiresAt?: string | null;
    createdAt: string;
    lastAccessedAt?: string | null;
    accessCount: number;
  };
  vehicle: {
    id: string;
    model: string;
    plate: string;
    status: VehicleStatus;
    company: Company;
    driver: string;
    firstRegistration: string;
    mileage: number;
    yearlyMileage: number;
    tuvDate: string;
    insuranceEnd: string;
    contractEnd: string;
    hadPreviousAccidents: boolean;
    damageStatus: VehicleDamageStatus;
    damageNotes?: string | null;
    imageUrl?: string | null;
    archivedAt?: string | null;
    incidents: Array<{
      id: string;
      title: string;
      description: string;
      status: VehicleIncidentStatus;
      occurredAt: string;
      repairedAt?: string | null;
      repairNotes?: string | null;
      attachments: Array<{
        id: string;
        title: string;
        documentType: VehicleDocumentType;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        createdAt: string;
      }>;
      createdAt: string;
      updatedAt: string;
    }>;
    maintenanceRecords: VehicleMaintenanceRecord[];
    documents: Array<Pick<VehicleDocument, "id" | "title" | "documentType" | "originalName" | "mimeType" | "sizeBytes" | "expiryDate" | "createdAt">>;
  };
}
