import { TFunction } from "i18next";
import { Vehicle, VehicleHistory } from "../types";

interface ExportVehiclePdfInput {
  vehicle: Vehicle;
  history: VehicleHistory[];
  t: TFunction;
}

export const exportVehiclePdfLazy = async (input: ExportVehiclePdfInput) => {
  const module = await import("./exportVehiclePdf");
  return module.exportVehiclePdf(input);
};
