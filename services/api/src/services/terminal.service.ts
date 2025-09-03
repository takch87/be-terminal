import { stripe } from './stripe.service';

export async function createConnectionToken() {
  const tok = await stripe.terminal.connectionTokens.create();
  return { secret: tok.secret! };
}