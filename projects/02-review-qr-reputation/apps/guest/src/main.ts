// Точка входа гостевого контейнера.
import { server } from './server.js';
import { assertProxyResolvable } from './client-ip.js';
await assertProxyResolvable();
const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, () => console.log(`guest listening on ${PORT}`));
