import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildConnector } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import { isPublicAddress, UnsafeSite, validateSite } from '../../src/site-safety';
import { createSafeHttp, type ConnectorFactory } from '../../src/safe-http';

const publicDns = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
describe('SC-US-002-3 SSRF', () => {
  it.each(['0.0.0.0', '10.0.0.1', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1',
    '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '168.63.129.16', '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    '2001::1', '2002:7f00:1::', '3fff::1', 'bad'])('%s закрыт', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888'])('%s публичный', (ip) =>
    expect(isPublicAddress(ip)).toBe(true));
  it('все DNS ответы должны быть безопасны; ошибка и пустой DNS закрыты', async () => {
    for (const resolver of [async () => [], async () => { throw new Error('dns'); },
      async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
      await expect(validateSite('https://example.test/', resolver)).rejects.toBeInstanceOf(UnsafeSite);
    }
  });
  it.each(['ftp://example.test', 'https://u:p@example.test/', 'https://example.test:8080/', 'http://2130706433/',
    'http://0x7f000001/', 'http://[::ffff:127.0.0.1]/'])('URL %s отклонён', async (raw) =>
    expect(validateSite(raw, publicDns)).rejects.toBeInstanceOf(UnsafeSite));
});

describe('реальный undici pinned transport через локальный connector, без внешней HTTP сети', () => {
  async function fixture(run: (port: number, hosts: string[]) => Promise<void>, slow = false) {
    const hosts: string[] = [];
    const server = createServer((req, res) => {
      hosts.push(req.headers.host!);
      res.writeHead(200, { 'content-type': 'text/html' }); res.write('<p>');
      if (!slow) res.end('hello</p>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try { await run((server.address() as AddressInfo).port, hosts); }
    finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
  function localFactory(port: number, pinned: string[]): ConnectorFactory {
    return (options) => buildConnector({ ...options, lookup: (host, opts, callback) => {
      const lookup = options.lookup!;
      lookup(host, { ...opts, all: false }, (error, address) => {
        if (error) { callback(error, '', 4); return; }
        pinned.push(String(address));
        // Маршрутизация только тестовым connector; production lookup уже вернул закреплённый публичный IP.
        if (opts.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
        else callback(null, '127.0.0.1', 4);
      });
    } });
  }
  it('IP закреплён, DNS один раз, оригинальный Host, тело загружено', async () => {
    await fixture(async (port, hosts) => {
      const pinned: string[] = [];
      const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
      // connector сохраняет параметры origin, меняет лишь локальный порт сокета.
      const baseFactory = localFactory(port, pinned);
      const connectorFactory: ConnectorFactory = (options) => {
        const connect = baseFactory(options);
        return (opts, callback) => connect({ ...opts, port: String(port) }, callback);
      };
      const result = await createSafeHttp({ resolver, connectorFactory })('http://fixture.test/', new AbortController().signal, 200);
      expect(result.body).toBe('<p>hello</p>'); expect(hosts).toEqual(['fixture.test']);
      expect(pinned).toEqual(['93.184.216.34']); expect(resolver).toHaveBeenCalledTimes(1);
    });
  });
  it('лимит полного тела и 15s hard timeout (ускоренный fixture) прерывают чтение', async () => {
    await fixture(async (port) => {
      const connectorFactory: ConnectorFactory = (options) => {
        const connect = buildConnector({ ...options, lookup: (_host, opts, cb) => {
          if (opts.all) cb(null, [{ address: '127.0.0.1', family: 4 }]); else cb(null, '127.0.0.1', 4);
        } });
        return (opts, cb) => connect({ ...opts, port: String(port) }, cb);
      };
      const signal = new AbortController().signal;
      await expect(createSafeHttp({ resolver: publicDns, connectorFactory })('http://fixture.test/', signal, 2)).rejects.toThrow();
      const started = Date.now();
      await expect(createSafeHttp({ resolver: publicDns, connectorFactory, timeoutMs: 30 })('http://fixture.test/', signal, 200)).rejects.toThrow();
      expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    }, true);
  });
  it('отмена ctx.signal до DNS не соединяется', async () => {
    const abort = new AbortController(); abort.abort(new Error('lease'));
    const resolver = vi.fn(publicDns);
    await expect(createSafeHttp({ resolver })('https://fixture.test', abort.signal, 200)).rejects.toThrow('lease');
    expect(resolver).not.toHaveBeenCalled();
  });
});
