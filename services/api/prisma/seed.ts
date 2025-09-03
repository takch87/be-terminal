import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const event = await db.event.upsert({
    where: { id: 'evt_local' },
    update: {},
    create: { id: 'evt_local', name: 'Evento Local', status: 'ACTIVE', currency: 'usd' },
  });
  await db.device.upsert({
    where: { id: 'DEVICE_001' },
    update: { eventId: event.id },
    create: { id: 'DEVICE_001', label: 'Device 001', eventId: event.id },
  });
  console.log('Seeded:', { event: event.id });
}

main().finally(() => db.$disconnect());