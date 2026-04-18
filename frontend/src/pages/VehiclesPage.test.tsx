import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAuthStore } from "../store";
import VehiclesPage from "./VehiclesPage";

const fetchVehicles = vi.fn();
const fetchCompanies = vi.fn();

vi.mock("../api", () => ({
  archiveVehicle: vi.fn(),
  fetchCompanies: (...args: unknown[]) => fetchCompanies(...args),
  fetchHistory: vi.fn(),
  fetchVehicle: vi.fn(),
  fetchVehicles: (...args: unknown[]) => fetchVehicles(...args),
  importVehicles: vi.fn(),
  restoreVehicle: vi.fn(),
  resolveAssetUrl: vi.fn((value?: string | null) => value ?? ""),
}));

vi.mock("../utils/exportVehiclePdfLazy", () => ({
  exportVehiclePdfLazy: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
  },
}));

describe("VehiclesPage", () => {
  beforeEach(async () => {
    fetchVehicles.mockReset();
    fetchCompanies.mockReset();
    await i18n.changeLanguage("en");
    useAuthStore.setState({
      token: "viewer-token",
      user: {
        id: "viewer-1",
        email: "viewer@solicar.com",
        role: "VIEWER",
        companyId: "company-1",
        companyName: "Fleet Partners",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: "2026-04-18T09:00:00.000Z",
        onboardingCompletedAt: "2026-04-18T09:30:00.000Z",
        sessionId: "session-viewer-1",
      },
    });
    fetchVehicles.mockResolvedValue({
      items: [
        {
          id: "vehicle-1",
          companyId: "company-1",
          model: "BMW i4",
          vin: "SC123456789",
          plate: "B-SC-1001",
          driver: "Alice Becker",
          mileage: 12345,
          status: "ACTIVE",
          hadPreviousAccidents: false,
          damageStatus: "NONE",
          incidentCount: 0,
          imageUrl: null,
          latitude: null,
          longitude: null,
          lastLocationUpdate: null,
          updatedAt: "2026-04-11T10:00:00.000Z",
          company: {
            id: "company-1",
            name: "Fleet Partners",
          },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 12,
        total: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
  });

  it("keeps export available while disabling write actions for viewers", async () => {
    render(
      <MemoryRouter>
        <VehiclesPage />
      </MemoryRouter>,
    );

    await screen.findByText("BMW i4");

    expect(fetchCompanies).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  });

  it("shows restore actions for archived vehicles", async () => {
    fetchVehicles.mockResolvedValueOnce({
      items: [
        {
          id: "vehicle-archived-1",
          companyId: "company-1",
          model: "Audi Q4",
          vin: "SCARCHIVED123",
          plate: "B-SC-2002",
          driver: "Ben Krause",
          mileage: 18000,
          status: "ARCHIVED",
          hadPreviousAccidents: true,
          damageStatus: "REPORTED",
          incidentCount: 1,
          imageUrl: null,
          latitude: null,
          longitude: null,
          lastLocationUpdate: null,
          archivedAt: "2026-04-12T10:00:00.000Z",
          archiveReason: "Seasonal archive",
          updatedAt: "2026-04-12T10:00:00.000Z",
          company: {
            id: "company-1",
            name: "Fleet Partners",
          },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 12,
        total: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    render(
      <MemoryRouter>
        <VehiclesPage />
      </MemoryRouter>,
    );

    await screen.findByText("Audi Q4");

    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
    expect(screen.getByText("Seasonal archive")).toBeInTheDocument();
  });
});
