import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { assertLocalPaymentTestDatabase } from '../src/lib/paymentTestFixtureGuard.js';

const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));

async function seedPaymentTestFixture() {
  let config;
  try {
    config = dotenv.parse(readFileSync(envPath, 'utf8'));
  } catch {
    throw new Error('Create backend/.env.test before seeding the local payment fixture.');
  }

  assertLocalPaymentTestDatabase(config.DATABASE_URL);
  if (config.PAYMENTS_ENABLED && config.PAYMENTS_ENABLED.toLowerCase() !== 'false') {
    throw new Error('Keep PAYMENTS_ENABLED=false while preparing test data.');
  }

  const email = String(config.PAYMENT_TEST_CUSTOMER_EMAIL || '').trim().toLowerCase();
  const password = config.PAYMENT_TEST_CUSTOMER_PASSWORD || '';
  if (!email.endsWith('.invalid') || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('Set PAYMENT_TEST_CUSTOMER_EMAIL to a synthetic address ending in .invalid.');
  }
  if (Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set a PAYMENT_TEST_CUSTOMER_PASSWORD between 12 and 72 UTF-8 bytes.');
  }

  process.env.DATABASE_URL = config.DATABASE_URL;
  process.env.PAYMENTS_ENABLED = 'false';
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const serviceName = 'Local Razorpay Payment Test Service';
  const fixtureNote = 'LOCAL_PAYMENT_TEST_FIXTURE';
  const now = new Date();
  const amount = 10;

  try {
    const result = await prisma.$transaction(async tx => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            passwordHash: await bcrypt.hash(password, 12),
            fullName: 'Local Payment Test Customer',
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerifiedAt: now
          }
        });
      } else if (user.role !== 'CUSTOMER' || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
        throw new Error('The configured test email already belongs to an incompatible account; no account was changed.');
      }

      const customer = await tx.customerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {}
      });

      let address = await tx.address.findFirst({
        where: { customerId: customer.id, label: 'Payment Test Address' }
      });
      if (!address) {
        address = await tx.address.create({
          data: {
            customerId: customer.id,
            label: 'Payment Test Address',
            type: 'HOME',
            line1: '1 Local Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '000000',
            isDefault: true
          }
        });
      }

      let plant = await tx.plant.findFirst({
        where: { customerId: customer.id, name: 'Payment Test Plant' }
      });
      if (!plant) {
        plant = await tx.plant.create({
          data: { customerId: customer.id, name: 'Payment Test Plant', type: 'Indoor', healthStatus: 'HEALTHY' }
        });
      }

      let service = await tx.service.findUnique({ where: { name: serviceName } });
      if (!service) {
        service = await tx.service.create({
          data: {
            name: serviceName,
            description: 'Local-only service used to test booking payments.',
            category: 'Plant Care',
            durationLabel: '30 minutes',
            durationMinutes: 30,
            status: 'ACTIVE'
          }
        });
      }
      if (service.status !== 'ACTIVE') {
        throw new Error('The local payment fixture service is inactive; no existing data was changed.');
      }

      let price = await tx.servicePrice.findFirst({
        where: {
          serviceId: service.id,
          minPlants: 1,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
        },
        orderBy: { effectiveFrom: 'desc' }
      });
      if (!price) {
        price = await tx.servicePrice.create({
          data: { serviceId: service.id, amount, minPlants: 1, effectiveFrom: now }
        });
      }

      const previous = await tx.booking.findFirst({
        where: { customerId: customer.id, serviceId: service.id, specialInstructions: fixtureNote, status: { not: 'CANCELLED' } },
        include: { payment: true },
        orderBy: { createdAt: 'desc' }
      });
      const completedPaymentStatuses = new Set(['AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);
      if (previous && !completedPaymentStatuses.has(previous.payment?.status)) {
        return { user, booking: previous, service, reused: true };
      }

      const scheduledStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const scheduledEnd = new Date(scheduledStart.getTime() + (service.durationMinutes || 30) * 60_000);
      const subtotal = Number(price.amount);
      const booking = await tx.booking.create({
        data: {
          reference: `TC-PAYTEST-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          customerId: customer.id,
          serviceId: service.id,
          addressId: address.id,
          scheduledStart,
          scheduledEnd,
          specialInstructions: fixtureNote,
          subtotal,
          convenienceFee: 0,
          total: subtotal,
          plants: { create: [{ plantId: plant.id }] },
          statusHistory: {
            create: {
              toStatus: 'CONFIRMED',
              changedBy: user.id,
              note: 'Created by the local payment test fixture.'
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'CREATE',
          entityType: 'Booking',
          entityId: booking.id,
          metadata: { reference: booking.reference, source: 'LOCAL_PAYMENT_TEST_FIXTURE' }
        }
      });
      return { user, booking, service, reused: false };
    });

    console.log(JSON.stringify({
      customerEmail: result.user.email,
      bookingId: result.booking.id,
      bookingReference: result.booking.reference,
      serviceName: result.service.name,
      amount: Number(result.booking.total),
      reused: result.reused
    }));
    console.log('No email or Razorpay request was sent. PAYMENTS_ENABLED remains false.');
  } finally {
    await prisma.$disconnect();
  }
}

seedPaymentTestFixture().catch(error => {
  console.error(error.message || 'Local payment fixture setup failed.');
  process.exitCode = 1;
});
