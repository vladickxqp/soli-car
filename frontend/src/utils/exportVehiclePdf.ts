import { TFunction } from "i18next";
import { Content, ContentTable, StyleDictionary, TDocumentDefinitions } from "pdfmake/interfaces";
import { formatCurrency, formatDate, formatDateTime, formatFileSize, formatNumber } from "../formatters";
import { Vehicle, VehicleHistory } from "../types";
import { getHistoryEntrySummary } from "./historyPresentation";

let fontsLoaded = false;

const loadPdfMake = async () => {
  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);

  const pdfMake = pdfMakeModule.default;
  const pdfFonts = pdfFontsModule.default;

  if (!fontsLoaded) {
    pdfMake.addVirtualFileSystem(pdfFonts);
    fontsLoaded = true;
  }

  return pdfMake;
};

const buildTable = (title: string, rows: Array<[string, string]>): ContentTable => ({
  layout: {
    fillColor: (rowIndex) => (rowIndex === 0 ? "#e8eef2" : rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff"),
    hLineColor: () => "#d7e0e7",
    vLineColor: () => "#d7e0e7",
    paddingLeft: () => 10,
    paddingRight: () => 10,
    paddingTop: () => 8,
    paddingBottom: () => 8,
  },
  table: {
    headerRows: 1,
    widths: ["34%", "*"],
    body: [
      [
        { text: title, style: "tableHeading", colSpan: 2 },
        {},
      ],
      ...rows.map(([label, value]) => [
        { text: label, style: "tableLabel" },
        { text: value || "-", style: "tableValue" },
      ]),
    ],
  },
});

const getDeadlineTone = (daysRemaining: number) => {
  if (daysRemaining <= 0) {
    return "#ef4444";
  }

  if (daysRemaining <= 7) {
    return "#f59e0b";
  }

  return "#0f766e";
};

const getDaysRemaining = (value: string) => {
  const target = new Date(value).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
};

const buildDeadlineCard = (label: string, value: string, t: TFunction): ContentTable => {
  const daysRemaining = getDaysRemaining(value);
  const tone = getDeadlineTone(daysRemaining);

  const statusLabel =
    daysRemaining <= 0
      ? t("notifications.expired", { count: Math.abs(daysRemaining) })
      : daysRemaining === 1
        ? t("notifications.dayLeft")
        : t("notifications.daysLeft", { count: daysRemaining });

  return {
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 12,
      paddingBottom: () => 12,
    },
    table: {
      widths: ["*"],
      body: [[
        {
          stack: [
            { text: label, style: "metaLabel" },
            { text: formatDate(value), style: "deadlineDate" },
            { text: statusLabel, color: tone, bold: true },
          ],
          fillColor: "#ffffff",
          margin: [0, 0, 0, 0],
        },
      ]],
    },
  };
};

interface ExportVehiclePdfOptions {
  vehicle: Vehicle;
  history: VehicleHistory[];
  t: TFunction;
}

export const exportVehiclePdf = async ({ vehicle, history, t }: ExportVehiclePdfOptions) => {
  const pdfMake = await loadPdfMake();

  const overviewRows: Array<[string, string]> = [
    [t("vehicle.company"), vehicle.company?.name ?? "-"],
    [t("vehicle.status"), t(`status.${vehicle.status}`)],
    [t("vehicle.damageStatus"), t(`damageStatus.${vehicle.damageStatus}`)],
    [t("vehicle.hadPreviousAccidents"), vehicle.hadPreviousAccidents ? t("common.yes") : t("common.no")],
    [t("vehicle.plate"), vehicle.plate],
    [t("vehicle.vin"), vehicle.vin],
    [t("vehicle.driver"), vehicle.driver],
    [t("vehicle.firstRegistration"), formatDate(vehicle.firstRegistration)],
    [t("vehicle.lastUpdate"), formatDate(vehicle.lastUpdate)],
    [t("vehicle.price"), formatCurrency(vehicle.price)],
  ];

  const incidentRows: Array<[string, string]> = [
    [t("vehicle.damageNotes"), vehicle.damageNotes || "-"],
    [t("vehicle.incidentCount"), formatNumber(vehicle.incidents.length)],
  ];

  const maintenanceRows: Array<[string, string]> = [
    [t("vehicleDetails.maintenance.summary.total"), formatNumber(vehicle.maintenanceRecords.length)],
    [
      t("vehicleDetails.maintenance.summary.open"),
      formatNumber(vehicle.maintenanceRecords.filter((record) => record.status !== "COMPLETED" && record.status !== "CANCELED").length),
    ],
    [
      t("vehicleDetails.maintenance.summary.totalCost"),
      formatCurrency(vehicle.maintenanceRecords.reduce((sum, record) => sum + (record.cost ?? 0), 0)),
    ],
    [
      t("vehicleDetails.maintenance.summary.nextReminder"),
      vehicle.maintenanceRecords
        .map((record) => record.reminderDate)
        .filter((value): value is string => Boolean(value))
        .sort()[0]
        ? formatDate(
            vehicle.maintenanceRecords
              .map((record) => record.reminderDate)
              .filter((value): value is string => Boolean(value))
              .sort()[0],
          )
        : "-",
    ],
  ];

  const documentRows: Array<[string, string]> = [
    [t("vehicleDetails.documents.summary.total"), formatNumber(vehicle.documents.length)],
    [
      t("vehicleDetails.documents.summary.expiring"),
      formatNumber(vehicle.documents.filter((document) => document.expiryDate).length),
    ],
    [
      t("vehicleDetails.documents.summary.withIncidents"),
      formatNumber(
        vehicle.incidents.reduce((sum, incident) => sum + incident.attachments.length, 0),
      ),
    ],
  ];

  const contractRows: Array<[string, string]> = [
    [t("vehicle.contractType"), vehicle.contractType],
    [t("vehicle.contractValue"), formatCurrency(vehicle.contractValue)],
    [t("vehicle.interest"), `${formatNumber(vehicle.interest)}%`],
    [t("vehicle.contractStart"), formatDate(vehicle.contractStart)],
    [t("vehicle.contractEnd"), formatDate(vehicle.contractEnd)],
    [t("vehicle.leasingPartner"), vehicle.leasingPartner],
    [t("vehicle.customerNumber"), vehicle.customerNumber],
    [t("vehicle.contractPartner"), vehicle.contractPartner],
    [t("vehicle.billingFrom"), formatDate(vehicle.billingFrom)],
    [t("vehicle.billedTo"), formatDate(vehicle.billedTo)],
    [t("vehicle.leasingRate"), formatCurrency(vehicle.leasingRate)],
  ];

  const insuranceRows: Array<[string, string]> = [
    [t("vehicle.insurancePartner"), vehicle.insurancePartner],
    [t("vehicle.insuranceNumber"), vehicle.insuranceNumber],
    [t("vehicle.insuranceCost"), formatCurrency(vehicle.insuranceCost)],
    [t("vehicle.insuranceStart"), formatDate(vehicle.insuranceStart)],
    [t("vehicle.insuranceEnd"), formatDate(vehicle.insuranceEnd)],
    [t("vehicle.mileage"), t("units.kilometers", { value: formatNumber(vehicle.mileage) })],
    [t("vehicle.yearlyMileage"), t("units.kilometers", { value: formatNumber(vehicle.yearlyMileage) })],
    [t("vehicle.taxPerYear"), formatCurrency(vehicle.taxPerYear)],
    [t("vehicle.paymentDate"), formatDate(vehicle.paymentDate)],
  ];

  const deadlineCards: Content[] = [
    buildDeadlineCard(t("notifications.types.TUV"), vehicle.tuvDate, t),
    buildDeadlineCard(t("notifications.types.INSURANCE"), vehicle.insuranceEnd, t),
    buildDeadlineCard(t("notifications.types.CONTRACT"), vehicle.contractEnd, t),
  ];

  const historyBlocks: Content[] = history.map(
    (entry) =>
      ({
        stack: [
          {
            columns: [
              { text: t(`history.actions.${entry.actionType}`), style: "historyTitle" },
              {
                text: formatDateTime(entry.timestamp),
                style: "historyMeta",
                alignment: "right",
              },
            ],
          },
          {
            text: `${entry.changedBy.email}`,
            style: "historyMeta",
            margin: [0, 4, 0, 8],
          },
          {
            ul: getHistoryEntrySummary(entry, t),
            style: "historyList",
            margin: [0, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 12],
        style: "historyCard",
      }) as Content,
  );

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 28, 30, 28],
    info: {
      title: `${vehicle.model} ${vehicle.plate} - Soli Car`,
      author: "Soli Car",
      subject: t("pdf.reportSubtitle"),
    },
    content: [
      {
        columns: [
          {
            stack: [
              { text: "Soli Car", style: "brand" },
              { text: t("pdf.reportTitle"), style: "headline" },
              { text: t("pdf.reportSubtitle"), style: "subheadline" },
            ],
          },
          {
            stack: [
              {
                text: t(`status.${vehicle.status}`),
                style: "statusBadge",
                alignment: "right",
              },
              {
                text: formatDateTime(new Date().toISOString()),
                style: "reportMeta",
                alignment: "right",
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          widths: ["*"],
          body: [[
            {
              stack: [
                { text: vehicle.model, style: "heroTitle" },
                {
                  text: `${vehicle.plate} / ${vehicle.vin}`,
                  style: "heroMeta",
                  margin: [0, 4, 0, 0],
                },
              ],
              fillColor: "#0f172a",
              color: "#ffffff",
              margin: [0, 0, 0, 0],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 16,
          paddingRight: () => 16,
          paddingTop: () => 18,
          paddingBottom: () => 18,
        },
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          { width: "*", stack: [buildTable(t("pdf.sections.vehicle"), overviewRows)] },
          { width: 14, text: "" },
          { width: "*", stack: [buildTable(t("pdf.sections.contract"), contractRows)] },
        ],
        margin: [0, 0, 0, 14],
      },
      buildTable(t("pdf.sections.insurance"), insuranceRows),
      buildTable(t("pdf.sections.incidents"), incidentRows),
      buildTable(t("pdf.sections.maintenance"), maintenanceRows),
      buildTable(t("pdf.sections.documents"), documentRows),
      {
        text: t("pdf.sections.incidentTimeline"),
        style: "sectionTitle",
        margin: [0, 18, 0, 10],
      },
      ...(vehicle.incidents.length > 0
        ? vehicle.incidents.map(
            (incident) =>
              ({
                stack: [
                  {
                    columns: [
                      { text: incident.title, style: "historyTitle" },
                      {
                        text: t(`incidentStatus.${incident.status}`),
                        style: "historyMeta",
                        alignment: "right",
                      },
                    ],
                  },
                  {
                    text: `${formatDate(incident.occurredAt)}${incident.repairedAt ? ` | ${formatDate(incident.repairedAt)}` : ""}`,
                    style: "historyMeta",
                    margin: [0, 4, 0, 8],
                  },
                  {
                    text: incident.description,
                    style: "tableValue",
                  },
                  ...(incident.repairNotes
                    ? [
                        {
                          text: `${t("vehicle.repairNotes")}: ${incident.repairNotes}`,
                          style: "historyMeta",
                          margin: [0, 8, 0, 0],
                        } as Content,
                      ]
                    : []),
                ],
                margin: [0, 0, 0, 12],
                style: "historyCard",
              }) as Content,
          )
        : [{ text: t("vehicleDetails.incidentsEmptyDescription"), style: "emptyCopy" }]),
      {
        text: t("pdf.sections.maintenanceTimeline"),
        style: "sectionTitle",
        margin: [0, 18, 0, 10],
      },
      ...(vehicle.maintenanceRecords.length > 0
        ? vehicle.maintenanceRecords.map(
            (record) =>
              ({
                stack: [
                  {
                    columns: [
                      { text: record.title, style: "historyTitle" },
                      {
                        text: t(`vehicleDetails.maintenance.status.${record.status}`),
                        style: "historyMeta",
                        alignment: "right",
                      },
                    ],
                  },
                  {
                    text: [
                      record.serviceDate ? formatDate(record.serviceDate) : null,
                      record.vendor ?? null,
                      record.cost != null ? formatCurrency(record.cost) : null,
                    ]
                      .filter(Boolean)
                      .join(" | "),
                    style: "historyMeta",
                    margin: [0, 4, 0, 8],
                  },
                  {
                    text: record.description || "-",
                    style: "tableValue",
                  },
                ],
                margin: [0, 0, 0, 12],
                style: "historyCard",
              }) as Content,
          )
        : [{ text: t("vehicleDetails.maintenance.emptyDescription"), style: "emptyCopy" }]),
      {
        text: t("pdf.sections.documentRegister"),
        style: "sectionTitle",
        margin: [0, 18, 0, 10],
      },
      ...(vehicle.documents.length > 0 || vehicle.incidents.some((incident) => incident.attachments.length > 0)
        ? [
            buildTable(
              t("pdf.sections.documents"),
              [
                ...vehicle.documents.map((document) => [
                  document.title,
                  [
                    t(`vehicleDetails.documents.types.${document.documentType}`),
                    document.originalName,
                    formatFileSize(document.sizeBytes),
                    document.expiryDate ? formatDate(document.expiryDate) : null,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                ] as [string, string]),
                ...vehicle.incidents.flatMap((incident) =>
                  incident.attachments.map(
                    (attachment) =>
                      [
                        `${incident.title}: ${attachment.title}`,
                        [
                          t(`vehicleDetails.documents.types.${attachment.documentType}`),
                          attachment.originalName,
                          formatFileSize(attachment.sizeBytes),
                        ]
                          .filter(Boolean)
                          .join(" | "),
                      ] as [string, string],
                  ),
                ),
              ],
            ),
          ]
        : [{ text: t("vehicleDetails.documentsEmptyDescription"), style: "emptyCopy" }]),
      {
        text: t("pdf.sections.deadlines"),
        style: "sectionTitle",
        margin: [0, 18, 0, 10],
      },
      {
        columns: deadlineCards,
        columnGap: 10,
      },
      {
        text: t("pdf.sections.history"),
        style: "sectionTitle",
        margin: [0, 18, 0, 10],
      },
      ...(historyBlocks.length > 0
        ? historyBlocks
        : [{ text: t("history.emptyDescription"), style: "emptyCopy" }]),
    ],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Soli Car", style: "footerText" },
        {
          text: `${currentPage} / ${pageCount}`,
          alignment: "right",
          style: "footerText",
        },
      ],
      margin: [30, 10, 30, 0],
    }),
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: "#0f172a",
    },
    styles: {
      brand: {
        fontSize: 11,
        bold: true,
        color: "#0f766e",
      },
      headline: {
        fontSize: 22,
        bold: true,
        margin: [0, 6, 0, 0],
      },
      subheadline: {
        fontSize: 10,
        color: "#475569",
        margin: [0, 4, 0, 0],
      },
      reportMeta: {
        fontSize: 9,
        color: "#64748b",
      },
      heroTitle: {
        fontSize: 22,
        bold: true,
      },
      heroMeta: {
        fontSize: 10,
        color: "#cbd5e1",
      },
      statusBadge: {
        fontSize: 10,
        bold: true,
        color: "#0f172a",
        background: "#ccfbf1",
        margin: [0, 0, 0, 0],
      },
      sectionTitle: {
        fontSize: 13,
        bold: true,
        color: "#0f172a",
      },
      tableHeading: {
        fontSize: 11,
        bold: true,
        color: "#0f172a",
      },
      tableLabel: {
        fontSize: 9,
        bold: true,
        color: "#475569",
      },
      tableValue: {
        fontSize: 10,
        color: "#0f172a",
      },
      metaLabel: {
        fontSize: 9,
        color: "#64748b",
      },
      deadlineDate: {
        fontSize: 15,
        bold: true,
        margin: [0, 4, 0, 5],
      },
      historyCard: {
        fillColor: "#f8fafc",
        margin: [0, 0, 0, 12],
      },
      historyTitle: {
        fontSize: 10,
        bold: true,
        color: "#0f172a",
      },
      historyMeta: {
        fontSize: 9,
        color: "#64748b",
      },
      historyList: {
        fontSize: 9,
        color: "#334155",
      },
      emptyCopy: {
        fontSize: 10,
        color: "#64748b",
      },
      footerText: {
        fontSize: 8,
        color: "#64748b",
      },
    } as StyleDictionary,
  };

  const safeFileName = `${vehicle.model}-${vehicle.plate}`.replace(/[^\w.-]+/g, "_");
  pdfMake.createPdf(docDefinition).download(`${safeFileName}.pdf`);
};
