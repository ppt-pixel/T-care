import { z } from 'zod';

const bcryptPasswordSchema = minimum => z.string()
    .min(minimum)
    .max(72)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, "Password must not exceed bcrypt's 72-byte limit.");

export const publicRegistrationSchema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
    password: bcryptPasswordSchema(8),
    phone: z.string().trim().min(7).max(20).optional(),
    accountType: z.literal('CUSTOMER').optional(),
    acceptTerms: z.literal(true),
    acceptPrivacy: z.literal(true)
});
