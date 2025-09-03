import { buildServer } from './server';

const port = Number(process.env.PORT || 4000);

buildServer()
  .then((app) => app.listen({ port, host: '0.0.0.0' }))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });