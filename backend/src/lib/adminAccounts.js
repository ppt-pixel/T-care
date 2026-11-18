import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const safeUserSelect = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    role: true,
    status: true,
    emailVerifiedAt: true,
    createdAt: true,
    lastLoginAt: true
};

function accountError(statusCode, code, message) {
    return Object.assign(new Error(message), { statusCode, code });
}

function createTemporaryPassword() {
    return crypto.randomBytes(24).toString('base64url');
}

export async function createManagedAccount({ prismaClient, actorUserId, account }) {
    const existing = await prismaClient.user.findUnique({
        where: { email: account.email },
        select: { id: true }
    });
    if (existing) {
        throw accountError(409, 'EMAIL_IN_USE', 'An account with this email already exists. No changes were made.');
    }

    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const verifiedAt = new Date();

    try {
        const user = await prismaClient.$transaction(async tx => {
            const duplicate = await tx.user.findUnique({
                where: { email: account.email },
                select: { id: true }
            });
            if (duplicate) {
                throw accountError(409, 'EMAIL_IN_USE', 'An account with this email already exists. No changes were made.');
            }

            const created = await tx.user.create({
                data: {
                    email: account.email,
                    passwordHash,
                    fullName: account.fullName,
                    phone: account.phone,
                    role: account.role,
                    status: 'ACTIVE',
                    emailVerifiedAt: verifiedAt,
                    ...(account.role === 'CUSTOMER'
                        ? { customerProfile: { create: {} } }
                        : { gardenerProfile: { create: { kycStatus: 'NOT_STARTED' } } })
                },
                select: safeUserSelect
            });

            await tx.auditLog.create({
                data: {
                    actorUserId,
                    action: 'CREATE',
                    entityType: 'User',
                    entityId: created.id,
                    metadata: { event: 'ADMIN_ACCOUNT_CREATED', role: created.role }
                }
            });

            return created;
        });

        return { user, temporaryPassword };
    } catch (error) {
        if (error?.code === 'P2002') {
            throw accountError(409, 'EMAIL_IN_USE', 'An account with this email already exists. No changes were made.');
        }
        throw error;
    }
}

export async function resetManagedCustomerPassword({ prismaClient, actorUserId, userId }) {
    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const reset = await prismaClient.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const existing = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true }
        });

        if (!existing) {
            throw accountError(404, 'USER_NOT_FOUND', 'Customer account not found.');
        }
        if (existing.role !== 'CUSTOMER') {
            throw accountError(409, 'CUSTOMER_ACCOUNT_REQUIRED', 'Only Customer account passwords can be reset here.');
        }

        const now = new Date();
        const user = await tx.user.update({
            where: { id: userId },
            data: { passwordHash, authVersion: { increment: 1 } },
            select: safeUserSelect
        });
        const revokedSessions = await tx.refreshSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now }
        });
        await tx.passwordResetToken.updateMany({
            where: { userId, consumedAt: null },
            data: { consumedAt: now }
        });
        await tx.auditLog.create({
            data: {
                actorUserId,
                action: 'UPDATE',
                entityType: 'User',
                entityId: userId,
                metadata: { event: 'ADMIN_CUSTOMER_PASSWORD_RESET', refreshSessionsRevoked: revokedSessions.count }
            }
        });

        return { user, revokedSessions: revokedSessions.count };
    });

    return { ...reset, temporaryPassword };
}
