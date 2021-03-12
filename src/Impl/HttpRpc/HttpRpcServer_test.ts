import * as http from 'http';
import { newTrace } from '../../newTrace';
import { Scene } from '../../Scene';
import { HttpRpcClient } from './HttpRpcClient';
import { strict } from 'assert';
import { HttpRpcServer } from './HttpRpcServer';
import fetch from 'node-fetch';

describe('HttpRpcClient', () => {
    let httpServer: http.Server;
    before(() => {
        (global as any).fetch = fetch;
    })
    afterEach(() => {
        httpServer.close();
    });
    it('成功执行', async () => {
        const rpcServer = new HttpRpcServer(
            {
                ioConf: {
                    database: undefined as any,
                    serviceProtocol: new HttpRpcClient(),
                },
            },
            async () => {
                return {
                    TestServer: {
                        testMethod: () => {
                            return 'hello';
                        }
                    }
                };
            },
            'TestServer',
            'testMethod',
        );
        httpServer = http.createServer(rpcServer.handler).listen(3000);
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: new HttpRpcClient(),
        });
        const result = await scene.execute(undefined, async () => {
            return await (scene.useServices('localhost') as any).testMethod();
        });
        strict.equal(result, 'hello')
    });
    it('加载代码抛异常', async () => {
        const rpcServer = new HttpRpcServer(
            {
                ioConf: {
                    database: undefined as any,
                    serviceProtocol: new HttpRpcClient(),
                },
            },
            async () => {
                throw new Error('wtf');
            },
            'TestServer',
            'testMethod',
        );
        httpServer = http.createServer(rpcServer.handler).listen(3000);
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: new HttpRpcClient(),
        });
        const result = scene.execute(undefined, async () => {
            return await (scene.useServices('localhost') as any).testMethod();
        });
        await strict.rejects(result, (e: any) => {
            return e.message.includes('wtf')
        })
    });
    it('执行代码抛异常', async () => {
        const rpcServer = new HttpRpcServer(
            {
                ioConf: {
                    database: undefined as any,
                    serviceProtocol: new HttpRpcClient(),
                },
            },
            async () => {
                return {
                    TestServer: {
                        testMethod: () => {
                            throw new Error('wtf');
                        }
                    }
                };
            },
            'TestServer',
            'testMethod',
        );
        httpServer = http.createServer(rpcServer.handler).listen(3000);
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: new HttpRpcClient(),
        });
        const result = scene.execute(undefined, async () => {
            return await (scene.useServices('localhost') as any).testMethod();
        });
        await strict.rejects(result, (e: any) => {
            return e.message.includes('wtf')
        })
    })
});
