// Resolve legacy account email casing safely. New accounts are stored lowercase,
// but older records may contain mixed case. Never pick an arbitrary record if
// case-insensitive duplicates exist.
export async function findLoginAccount(prismaClient, normalizedEmail) {
    const matches = await prismaClient.user.findMany({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        include: { customerProfile: true, gardenerProfile: true },
        take: 2
    });
    return matches.length === 1 ? matches[0] : null;
}
