import { InvitationStatus } from "@prisma/client";
import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { hashInvitationToken } from "../utils/invitations.js";

const router = Router();

router.get("/:token", async (req, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token ?? "").trim();
    if (!token) {
      return res.status(400).json({
        code: "INVITATION_INVALID",
        message: "Invitation is invalid",
      });
    }

    const invitation = await prisma.companyInvitation.findUnique({
      where: {
        tokenHash: hashInvitationToken(token),
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        inviter: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        code: "INVITATION_NOT_FOUND",
        message: "Invitation not found",
      });
    }

    if (invitation.status === InvitationStatus.PENDING && invitation.expiresAt.getTime() < Date.now()) {
      await prisma.companyInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });

      return res.json({
        data: {
          ...invitation,
          status: InvitationStatus.EXPIRED,
        },
      });
    }

    res.json({ data: invitation });
  } catch (error) {
    next(error);
  }
});

export default router;

