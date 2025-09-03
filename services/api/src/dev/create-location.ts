import { stripe } from '../services/stripe.service';

async function main() {
  // Try to find an existing test location
  const list = await stripe.terminal.locations.list({ limit: 1 });
  if (list.data.length > 0) {
    console.log('Existing location:', list.data[0].id, '-', list.data[0].display_name);
    return;
  }
  const loc = await stripe.terminal.locations.create({
    display_name: 'Local Test',
    address: {
      line1: '123 Test St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94111',
      country: 'US',
    },
  });
  console.log('Created location:', loc.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
