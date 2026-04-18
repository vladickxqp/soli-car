import { describe, expect, it, vi } from "vitest";
import { exportVehiclePdfLazy } from "./exportVehiclePdfLazy";

const exportVehiclePdfMock = vi.fn();

vi.mock("./exportVehiclePdf", () => ({
  exportVehiclePdf: (...args: unknown[]) => exportVehiclePdfMock(...args),
}));

describe("exportVehiclePdfLazy", () => {
  it("loads the heavy PDF module on demand and forwards the export payload", async () => {
    exportVehiclePdfMock.mockResolvedValue(undefined);

    const input = {
      vehicle: {
        id: "vehicle-1",
      },
      history: [],
      t: ((key: string) => key) as never,
    };

    await exportVehiclePdfLazy(input as never);

    expect(exportVehiclePdfMock).toHaveBeenCalledTimes(1);
    expect(exportVehiclePdfMock).toHaveBeenCalledWith(input);
  });
});
