-- Keep a Gardener assignment state aligned with a cancelled booking.
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
