import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import vehicleRoutes from "./routes/vehicles.js";
import uploadRoutes from "./routes/upload.js";
import companyRoutes from "./routes/companies.js";
import adminUsersRoutes from "./routes/adminUsers.js";
import adminCompaniesRoutes from "./routes/adminCompanies.js";
import adminLogsRoutes from "./routes/adminLogs.js";
import adminTicketsRoutes from "./routes/adminTickets.js";
import adminApprovalsRoutes from "./routes/adminApprovals.js";
import adminVehiclesRoutes from "./routes/adminVehicles.js";
import ticketRoutes from "./routes/tickets.js";
import billingRoutes, { billingWebhookRouter } from "./routes/billing.js";
import analyticsRoutes from "./routes/analytics.js";
import invitationRoutes from "./routes/invitations.js";
import reminderRoutes from "./routes/reminders.js";
import notificationRoutes from "./routes/notifications.js";
import activityRoutes from "./routes/activity.js";
import publicRoutes from "./routes/public.js";
import { errorHandler } from "./middleware/errorHandler.js";
import prisma from "./utils/prisma.js";

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const appUrl = (process.env.APP_URL ?? "").trim();
const allowedOrigins = new Set(
  [...defaultAllowedOrigins, ...configuredOrigins, ...(appUrl ? [appUrl] : [])].filter(Boolean),
);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
  }),
);
app.use("/billing/webhook", billingWebhookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads/vehicle-images", express.static("uploads/vehicle-images"));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      database: "up",
      uptime: Math.round(process.uptime()),
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "down",
    });
  }
});

app.use("/auth", authRoutes);
app.use("/invitations", invitationRoutes);
app.use("/admin/users", adminUsersRoutes);
app.use("/admin/companies", adminCompaniesRoutes);
app.use("/admin/logs", adminLogsRoutes);
app.use("/admin/tickets", adminTicketsRoutes);
app.use("/admin/approvals", adminApprovalsRoutes);
app.use("/admin/vehicles", adminVehiclesRoutes);
app.use("/tickets", ticketRoutes);
app.use("/billing", billingRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/reminders", reminderRoutes);
app.use("/notifications", notificationRoutes);
app.use("/activity", activityRoutes);
app.use("/public", publicRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/vehicles", uploadRoutes);
app.use("/companies", companyRoutes);

app.use(errorHandler);

export default app;
