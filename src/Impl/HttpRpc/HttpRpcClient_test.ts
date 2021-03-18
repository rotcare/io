import * as http from 'http';
import { newTrace } from '../../tracing';
import { Scene } from '../../Scene';
import { HttpRpcClient } from './HttpRpcClient';
import { strict } from 'assert';
import fetch from 'node-fetch';
import * as dns from 'dns';
import { promisify } from 'util';
import * as net from 'net';

const resolve = promisify(dns.resolve4);

async function isPortReachable(port: number) {
	const promise = new Promise(((resolve, reject) => {
		const socket = new net.Socket();

		const onError = () => {
			socket.destroy();
			reject();
		};

		socket.setTimeout(500);
		socket.once('error', onError);
		socket.once('timeout', onError);

		socket.connect(port, 'localhost', () => {
			socket.end();
			resolve(undefined);
		});
	}));

	try {
		await promise;
		return true;
	} catch (_) {
		return false;
	}
};
describe('HttpRpcClient', () => {
    let server: http.Server;
    before(() => {
        (global as any).fetch = fetch;
    })
    afterEach(() => {
        server.close();
    });
    it('成功调用', async () => {
        console.log('!!!', await isPortReachable(6379));
        let reqBody = '';
        let url = '';
        server = http
            .createServer(async (req, resp) => {
                req.on('data', (chunk) => {
                    reqBody += chunk;
                });
                req.on('end', () => {
                    url = req.url!;
                    resp.end(
                        JSON.stringify({ index: 0, data: 'hello', read: [], changed: [] }),
                    );
                });
            })
            .listen(3000);
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: new HttpRpcClient(),
        });
        const result = await scene.execute(undefined, async () => {
            return await (scene.useServices('localhost') as any).doSomething1();
        });
        strict.equal('/doSomething1', url);
        strict.deepEqual([[]], JSON.parse(reqBody));
        strict.equal('hello', result);
    });
    it('调用出错', async () => {
        let reqBody = '';
        let url = '';
        server = http
            .createServer(async (req, resp) => {
                req.on('data', (chunk) => {
                    reqBody += chunk;
                });
                req.on('end', () => {
                    url = req.url!;
                    resp.end(
                        JSON.stringify({ index: 0, error: 'wtf' }),
                    );
                });
            })
            .listen(3000);
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: new HttpRpcClient(),
        });
        await strict.rejects(scene.execute(undefined, async () => {
            return await (scene.useServices('localhost') as any).doSomething2();
        }), (e) => {
            return e.message === 'wtf';
        })
        strict.equal('/doSomething2', url);
        strict.deepEqual([[]], JSON.parse(reqBody));
    })
});
