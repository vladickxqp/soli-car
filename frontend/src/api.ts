import {
  ActivityFeedItem,
  AppNotification,
  AdvancedAnalytics,
  ApprovalActionResponse,
  ApprovalRequest,
  AdminCompanyDetail,
  AdminCompanyListItem,
  AdminUser,
  AuthData,
  AuthUser,
  BillingSummary,
  Company,
  CompanyInvitation,
  CompanyWorkspaceDetail,
  DashboardSummary,
  GlobalSearchResult,
  ImportVehiclesResult,
  InvitationPreview,
  NotificationSummary,
  PaginatedResult,
  PublicVehicleSnapshot,
  ReminderItem,
  SupportTicket,
  SystemLogEntry,
  UserSessionRecord,
  VerificationDeliveryResponse,
  Vehicle,
  VehicleDocument,
  VehicleHistory,
  VehicleLocationItem,
  VehicleListItem,
  VehicleMaintenanceRecord,
  VehiclePayload,
  VehiclePublicShareLink,
  VerificationRequiredResponse,
} from "./types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type ApiEnvelope<T> = {
  data: T;
  meta?: unknown;
  code?: string;
  message?: string;
};

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const withAuth = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

const requestJson = async (path: string, init?: RequestInit) => {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError("Network error", 0, "NETWORK_ERROR");
  }

  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : undefined;

  if (!response.ok) {
    throw new ApiError(body?.message ?? "API request failed", response.status, body?.code);
  }

  return body;
};

const requestData = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const body = (await requestJson(path, init)) as ApiEnvelope<T> | T | undefined;

  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiEnvelope<T>).data;
  }

  return body as T;
};

export const resolveAssetUrl = (path?: string | null) => {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_URL}${path}`;
};

export const authRegister = (payload: {
  email: string;
  password: string;
  registrationType: "COMPANY" | "INDIVIDUAL";
  companyName?: string;
  invitationToken?: string;
}) =>
  requestData<VerificationRequiredResponse>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const authLogin = (payload: { email: string; password: string }) =>
  requestData<AuthData>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const requestPasswordReset = (payload: { email: string }) =>
  requestData<{ success: true }>("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const resendVerificationEmail = (payload: { email: string }) =>
  requestData<VerificationDeliveryResponse>("/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const verifyEmailToken = (payload: { token: string }) =>
  requestData<AuthData>("/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const resetPassword = (payload: { token: string; password: string }) =>
  requestData<{ success: true }>("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const changeOwnPassword = (token: string, payload: { currentPassword: string; newPassword: string }) =>
  requestData<{ success: true }>("/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const completeOnboarding = (
  token: string,
  payload: {
    preferredLanguage?: string;
    preferredTheme?: string;
    preferredVehicleView?: string;
  },
) =>
  requestData<{ success: true; user: AuthUser }>("/auth/onboarding/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const fetchSessions = (token: string) =>
  requestData<UserSessionRecord[]>("/auth/sessions", {
    headers: withAuth(token),
  });

export const revokeSession = (token: string, sessionId: string) =>
  requestData<{ success: true; currentSessionRevoked: boolean }>(`/auth/sessions/${sessionId}/revoke`, {
    method: "POST",
    headers: withAuth(token),
  });

export const logoutSession = (token: string) =>
  requestData<{ success: true }>("/auth/logout", {
    method: "POST",
    headers: withAuth(token),
  });

export const fetchVehicles = (
  token: string,
  options?: {
    search?: string;
    status?: string;
    companyId?: string;
    archived?: "active" | "archived" | "all";
    sortField?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();

  if (options?.search) params.set("search", options.search);
  if (options?.status) params.set("status", options.status);
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.archived) params.set("archived", options.archived);
  if (options?.sortField) params.set("sortField", options.sortField);
  if (options?.sortOrder) params.set("sortOrder", options.sortOrder);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<VehicleListItem>>(`/vehicles${query}`, {
    headers: withAuth(token),
  });
};

export const searchVehicles = (token: string, query: string, companyId?: string) => {
  const params = new URLSearchParams({ query });
  if (companyId) params.set("companyId", companyId);

  return requestData<GlobalSearchResult[]>(`/vehicles/search/global?${params.toString()}`, {
    headers: withAuth(token),
  });
};

export const fetchVehicle = (token: string, id: string) =>
  requestData<Vehicle>(`/vehicles/${id}`, {
    headers: withAuth(token),
  });

export const createVehicle = (token: string, payload: VehiclePayload) =>
  requestData<Vehicle>("/vehicles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const updateVehicle = (token: string, id: string, payload: VehiclePayload) =>
  requestData<Vehicle>(`/vehicles/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const deleteVehicle = (token: string, id: string) =>
  requestJson(`/vehicles/${id}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const archiveVehicle = (token: string, id: string, reason?: string) =>
  requestData<Vehicle | null>(`/vehicles/${id}/archive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ reason }),
  });

export const restoreVehicle = (token: string, id: string, status?: string) =>
  requestData<Vehicle | null>(`/vehicles/${id}/restore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ status }),
  });

export const fetchHistory = (token: string, id: string) =>
  requestData<VehicleHistory[]>(`/vehicles/${id}/history`, {
    headers: withAuth(token),
  });

export const transferVehicle = (token: string, id: string, companyId: string) =>
  requestData<Vehicle>(`/vehicles/${id}/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ companyId }),
  });

export const fetchAnalytics = (token: string, companyId?: string) => {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return requestData<DashboardSummary>(`/vehicles/analytics/summary${query}`, {
    headers: withAuth(token),
  });
};

export const fetchAdvancedAnalytics = (token: string, companyId?: string) => {
  const params = new URLSearchParams();
  if (companyId) {
    params.set("companyId", companyId);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<AdvancedAnalytics>(`/analytics${query}`, {
    headers: withAuth(token),
  });
};

export const updateVehicleStatus = (token: string, id: string, status: string) =>
  requestData<Vehicle>(`/vehicles/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ status }),
  });

export const uploadImage = async (token: string, file: File) => {
  const formData = new FormData();
  formData.append("image", file);

  return requestData<{ imageUrl: string }>("/vehicles/upload-image", {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const importVehicles = async (token: string, file: File, companyId?: string) => {
  const formData = new FormData();
  formData.append("file", file);
  if (companyId) {
    formData.append("companyId", companyId);
  }

  return requestData<ImportVehiclesResult>("/vehicles/import", {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const fetchCompanies = (token: string) =>
  requestData<Company[]>("/companies", {
    headers: withAuth(token),
  });

export const fetchCompanyWorkspaceDetail = (token: string, companyId: string, status?: string) => {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<CompanyWorkspaceDetail>(`/companies/${companyId}/detail${query}`, {
    headers: withAuth(token),
  });
};

export const createCompanyInvitation = (
  token: string,
  companyId: string,
  payload: { email: string; role: string; expiresInDays: number },
) =>
  requestData<CompanyInvitation>(`/companies/${companyId}/invitations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const revokeCompanyInvitation = (token: string, companyId: string, invitationId: string) =>
  requestJson(`/companies/${companyId}/invitations/${invitationId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const fetchInvitationPreview = (token: string) =>
  requestData<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);

export const fetchBillingSummary = (token: string, companyId?: string) => {
  const params = new URLSearchParams();
  if (companyId) {
    params.set("companyId", companyId);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<BillingSummary>(`/billing${query}`, {
    headers: withAuth(token),
  });
};

export const changeBillingPlan = (
  token: string,
  payload: { plan: string; companyId?: string },
) =>
  requestData<{
    action: "checkout" | "updated";
    checkoutUrl?: string;
    sessionId?: string;
    mode?: "stripe" | "mock";
  } & BillingSummary>("/billing/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const fetchVehicleLocations = (
  token: string,
  options?: {
    companyId?: string;
    search?: string;
    status?: string;
  },
) => {
  const params = new URLSearchParams();
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.search) params.set("search", options.search);
  if (options?.status) params.set("status", options.status);

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<VehicleLocationItem[]>(`/vehicles/location${query}`, {
    headers: withAuth(token),
  });
};

export const updateVehicleLocation = (
  token: string,
  payload: { vehicleId: string; latitude: number; longitude: number; lastLocationUpdate?: string },
) =>
  requestData<Vehicle>("/vehicles/location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const uploadVehicleDocument = async (
  token: string,
  vehicleId: string,
  payload: { title: string; documentType: string; expiryDate?: string; incidentId?: string; file: File },
) => {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("documentType", payload.documentType);
  if (payload.expiryDate) {
    formData.append("expiryDate", payload.expiryDate);
  }
  if (payload.incidentId) {
    formData.append("incidentId", payload.incidentId);
  }
  formData.append("file", payload.file);

  return requestData<VehicleDocument>(`/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const uploadIncidentAttachment = async (
  token: string,
  vehicleId: string,
  incidentId: string,
  payload: { title: string; file: File },
) => {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("file", payload.file);

  return requestData<VehicleDocument>(`/vehicles/${vehicleId}/incidents/${incidentId}/attachments`, {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const deleteVehicleDocument = (token: string, vehicleId: string, documentId: string) =>
  requestJson(`/vehicles/${vehicleId}/documents/${documentId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const restoreVehicleDocument = (token: string, vehicleId: string, documentId: string) =>
  requestData<VehicleDocument>(`/vehicles/${vehicleId}/documents/${documentId}/restore`, {
    method: "POST",
    headers: withAuth(token),
  });

export const fetchVehicleDocumentBlob = async (token: string, documentId: string) => {
  const response = await fetch(`${API_URL}/vehicles/documents/${documentId}/download`, {
    headers: withAuth(token),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiError(body?.message ?? "Download failed", response.status, body?.code);
  }

  return response.blob();
};

export const fetchVehicleShareLinks = (token: string, vehicleId: string) =>
  requestData<VehiclePublicShareLink[]>(`/vehicles/${vehicleId}/share-links`, {
    headers: withAuth(token),
  });

export const createVehicleShareLink = (
  token: string,
  vehicleId: string,
  payload?: { label?: string; expiresInDays?: number },
) =>
  requestData<VehiclePublicShareLink>(`/vehicles/${vehicleId}/share-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload ?? {}),
  });

export const revokeVehicleShareLink = (token: string, vehicleId: string, shareLinkId: string) =>
  requestData<{ success: true }>(`/vehicles/${vehicleId}/share-links/${shareLinkId}/revoke`, {
    method: "POST",
    headers: withAuth(token),
  });

export const fetchPublicVehicleSnapshot = (token: string) =>
  requestData<PublicVehicleSnapshot>(`/public/vehicles/${encodeURIComponent(token)}`);

export const createMaintenanceRecord = (
  token: string,
  vehicleId: string,
  payload: {
    title: string;
    description?: string;
    status: string;
    serviceDate?: string;
    completedAt?: string;
    cost?: string;
    vendor?: string;
    mileage?: number;
    reminderDate?: string;
  },
) =>
  requestData<VehicleMaintenanceRecord>(`/vehicles/${vehicleId}/maintenance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const updateMaintenanceRecord = (
  token: string,
  vehicleId: string,
  recordId: string,
  payload: {
    title: string;
    description?: string;
    status: string;
    serviceDate?: string;
    completedAt?: string;
    cost?: string;
    vendor?: string;
    mileage?: number;
    reminderDate?: string;
  },
) =>
  requestData<VehicleMaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/${recordId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const deleteMaintenanceRecord = (token: string, vehicleId: string, recordId: string) =>
  requestJson(`/vehicles/${vehicleId}/maintenance/${recordId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const restoreMaintenanceRecord = (token: string, vehicleId: string, recordId: string) =>
  requestData<VehicleMaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/${recordId}/restore`, {
    method: "POST",
    headers: withAuth(token),
  });

export const fetchAdminUsers = (
  token: string,
  options?: {
    search?: string;
    role?: string;
    companyId?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.role) params.set("role", options.role);
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<AdminUser>>(`/admin/users${query}`, {
    headers: withAuth(token),
  });
};

export const createAdminUser = (
  token: string,
  payload: { email: string; password: string; role: string; companyId: string; isPlatformAdmin: boolean },
) =>
  requestData<AdminUser | ApprovalActionResponse>("/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const updateAdminUser = (
  token: string,
  userId: string,
  payload: { email: string; role: string; companyId: string; isPlatformAdmin: boolean },
) =>
  requestData<AdminUser | ApprovalActionResponse>(`/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const resetAdminUserPassword = (token: string, userId: string, password: string) =>
  requestData<{ success: true } | ApprovalActionResponse>(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ password }),
  });

export const deleteAdminUser = (token: string, userId: string) =>
  requestData<ApprovalActionResponse | undefined>(`/admin/users/${userId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const fetchAdminCompanies = (
  token: string,
  options?: { search?: string; page?: number; pageSize?: number },
) => {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<AdminCompanyListItem>>(`/admin/companies${query}`, {
    headers: withAuth(token),
  });
};

export const fetchAdminCompany = (token: string, companyId: string) =>
  requestData<AdminCompanyDetail>(`/admin/companies/${companyId}`, {
    headers: withAuth(token),
  });

export const createAdminCompany = (token: string, name: string) =>
  requestData<Company>("/admin/companies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ name }),
  });

export const updateAdminCompany = (token: string, companyId: string, name: string) =>
  requestData<Company>(`/admin/companies/${companyId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ name }),
  });

export const deleteAdminCompany = (token: string, companyId: string) =>
  requestData<ApprovalActionResponse | undefined>(`/admin/companies/${companyId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const fetchAdminApprovals = (
  token: string,
  options?: {
    search?: string;
    status?: string;
    action?: string;
    companyId?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.status) params.set("status", options.status);
  if (options?.action) params.set("action", options.action);
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<ApprovalRequest>>(`/admin/approvals${query}`, {
    headers: withAuth(token),
  });
};

export const approveAdminApproval = (token: string, approvalId: string, reviewComment?: string) =>
  requestData<ApprovalRequest>(`/admin/approvals/${approvalId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ reviewComment }),
  });

export const rejectAdminApproval = (token: string, approvalId: string, reviewComment?: string) =>
  requestData<ApprovalRequest>(`/admin/approvals/${approvalId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ reviewComment }),
  });

export const adminTransferVehicle = (
  token: string,
  vehicleId: string,
  companyId: string,
) =>
  requestData<ApprovalActionResponse>(`/admin/vehicles/${vehicleId}/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify({ companyId }),
  });

export const adminDeleteVehicle = (token: string, vehicleId: string) =>
  requestData<ApprovalActionResponse>(`/admin/vehicles/${vehicleId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });

export const fetchReminders = (
  token: string,
  options?: {
    companyId?: string;
    type?: string;
    state?: string;
  },
) => {
  const params = new URLSearchParams();
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.type) params.set("type", options.type);
  if (options?.state) params.set("state", options.state);

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<ReminderItem[]>(`/reminders${query}`, {
    headers: withAuth(token),
  });
};

export const fetchSupportTickets = (token: string) =>
  requestData<SupportTicket[]>("/tickets", {
    headers: withAuth(token),
  });

export const fetchSupportTicket = (token: string, ticketId: string) =>
  requestData<SupportTicket>(`/tickets/${ticketId}`, {
    headers: withAuth(token),
  });

export const fetchTicketAttachmentBlob = async (token: string, messageId: string) => {
  const response = await fetch(`${API_URL}/tickets/messages/${messageId}/attachment`, {
    headers: withAuth(token),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiError(body?.message ?? "Download failed", response.status, body?.code);
  }

  return response.blob();
};

export const createSupportTicket = async (
  token: string,
  payload: {
    category: string;
    message: string;
    attachment?: File | null;
    vehicleId?: string;
    vehicleIncidentId?: string;
  },
) => {
  const formData = new FormData();
  formData.append("category", payload.category);
  formData.append("message", payload.message);
  if (payload.vehicleId) {
    formData.append("vehicleId", payload.vehicleId);
  }
  if (payload.vehicleIncidentId) {
    formData.append("vehicleIncidentId", payload.vehicleIncidentId);
  }
  if (payload.attachment) {
    formData.append("attachment", payload.attachment);
  }

  return requestData<SupportTicket>("/tickets", {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const replyToSupportTicket = async (
  token: string,
  ticketId: string,
  payload: { message: string; attachment?: File | null },
) => {
  const formData = new FormData();
  formData.append("message", payload.message);
  if (payload.attachment) {
    formData.append("attachment", payload.attachment);
  }

  return requestData<SupportTicket>(`/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const fetchAdminTickets = (
  token: string,
  options?: {
    search?: string;
    status?: string;
    priority?: string;
    companyId?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.status) params.set("status", options.status);
  if (options?.priority) params.set("priority", options.priority);
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<SupportTicket>>(`/admin/tickets${query}`, {
    headers: withAuth(token),
  });
};

export const fetchAdminTicket = (token: string, ticketId: string) =>
  requestData<SupportTicket>(`/admin/tickets/${ticketId}`, {
    headers: withAuth(token),
  });

export const replyToAdminTicket = async (
  token: string,
  ticketId: string,
  payload: { message: string; attachment?: File | null },
) => {
  const formData = new FormData();
  formData.append("message", payload.message);
  if (payload.attachment) {
    formData.append("attachment", payload.attachment);
  }

  return requestData<SupportTicket>(`/admin/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: withAuth(token),
    body: formData,
  });
};

export const updateAdminTicket = (
  token: string,
  ticketId: string,
  payload: { status?: string; priority?: string },
) =>
  requestData<SupportTicket>(`/admin/tickets/${ticketId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(payload),
  });

export const fetchAdminLogs = (
  token: string,
  options?: {
    search?: string;
    entityType?: string;
    action?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.entityType) params.set("entityType", options.entityType);
  if (options?.action) params.set("action", options.action);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<SystemLogEntry>>(`/admin/logs${query}`, {
    headers: withAuth(token),
  });
};

export const fetchNotificationSummary = (token: string) =>
  requestData<NotificationSummary>("/notifications/summary", {
    headers: withAuth(token),
  });

export const fetchNotifications = (
  token: string,
  options?: {
    status?: string;
    type?: string;
    priority?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.type) params.set("type", options.type);
  if (options?.priority) params.set("priority", options.priority);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<{ items: AppNotification[]; pagination: PaginatedResult<AppNotification>["pagination"]; unreadCount: number }>(`/notifications${query}`, {
    headers: withAuth(token),
  });
};

export const markNotificationRead = (token: string, notificationId: string) =>
  requestData<{ success: true }>(`/notifications/${notificationId}/read`, {
    method: "POST",
    headers: withAuth(token),
  });

export const markAllNotificationsRead = (token: string) =>
  requestData<{ success: true }>("/notifications/read-all", {
    method: "POST",
    headers: withAuth(token),
  });

export const archiveNotification = (token: string, notificationId: string) =>
  requestData<{ success: true }>(`/notifications/${notificationId}/archive`, {
    method: "POST",
    headers: withAuth(token),
  });

export const fetchActivity = (
  token: string,
  options?: {
    companyId?: string;
    entityType?: string;
    userId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const params = new URLSearchParams();
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.entityType) params.set("entityType", options.entityType);
  if (options?.userId) params.set("userId", options.userId);
  if (options?.search) params.set("search", options.search);
  if (options?.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options?.dateTo) params.set("dateTo", options.dateTo);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const query = params.toString() ? `?${params.toString()}` : "";
  return requestData<PaginatedResult<ActivityFeedItem>>(`/activity${query}`, {
    headers: withAuth(token),
  });
};
