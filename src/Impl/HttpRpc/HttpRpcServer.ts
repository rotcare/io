import type { ServerResponse, IncomingMessage } from 'http';
import { newTrace, Span } from '../../tracing';
import { Atom, AtomReader, IoConf, Scene } from '../../Scene';
import { JobBatch, Job } from './HttpRpc';

export class HttpRpcServer {
    constructor(
        private readonly options: { ioConf: IoConf },
        private readonly moduleProvider: () => Promise<any>,
        private readonly className: string,
        private readonly staticMethodName: string,
    ) { }
    public get handler() {
        return async (req: IncomingMessage, resp: ServerResponse) => {
            let reqBody = '';
            req.on('data', (chunk) => {
                reqBody += chunk;
            });
            await new Promise((resolve) => req.on('end', resolve));
            resp.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'X-Content-Type-Options': 'nosniff',
            });
            const argsArr: any[][] = JSON.parse(reqBody) || [];
            const jobs: Job[] = argsArr.map((args, index) => { return { index, args } });
            try {
                const staticMethod = await this.staticMethod();
                const batchExecute = staticMethod.batchExecute;
                let batches: JobBatch[] = [];
                if (batchExecute) {
                    batches = batchExecute(jobs);
                } else {
                    for (const job of jobs) {
                        batches.push(convertJobAsBatch(job, staticMethod));
                    }
                }
                const span = createSpanFromHeaders(req.headers) || newTrace(`handle ${req.url}`);
                const promises = batches.map(batch =>
                    this.execute({ batch, span, resp }),
                );
                await Promise.all(promises);
            } catch (e) {
                for (let index = 0; index < jobs.length; index++) {
                    resp.write(JSON.stringify({ index, error: new String(e) }) + '\n');
                }
            } finally {
                resp.end();
            }
        };
    }
    private async module() {
        try {
            const module = await this.moduleProvider();
            if (!module) {
                throw new Error(`module is: ${module}`);
            }
            return module;
        } catch (e) {
            throw new Error(`failed to load module: ${e}`);
        }
    }
    private async clazz() {
        const module = await this.module();
        const clazz = Reflect.get(module, this.className);
        if (!clazz) {
            throw new Error(`class ${this.className} not found in module`);
        }
        return clazz;
    }
    private async staticMethod() {
        const clazz = await this.clazz();
        const staticMethod = Reflect.get(clazz, this.staticMethodName);
        if (!staticMethod) {
            throw new Error(`static method ${this.staticMethodName} not found in class ${clazz}`);
        }
        return staticMethod;
    }

    private async execute(options: {
        batch: JobBatch;
        span: Span;
        resp: ServerResponse;
    }) {
        const { span, resp, batch } = options;
        const scene = new Scene(span, this.options.ioConf);
        const read: string[] = [];
        const changed: string[] = [];
        scene.onAtomChanged = (atom) => {
            if (atom.tableName && !changed.includes(atom.tableName)) {
                changed.push(atom.tableName);
            }
        };
        const reader: AtomReader = {
            onAtomRead(atom: Atom) {
                if (atom.tableName && !read.includes(atom.tableName)) {
                    read.push(atom.tableName);
                }
            },
        };
        await scene.execute(reader, async () => {
            try {
                await batch.execute(scene);
                for (const job of batch.jobs) {
                    resp.write(JSON.stringify({ index: job.index, data: job.result, read, changed }) + '\n');
                }
            } catch (e) {
                scene.reportEvent('failed to handle', { batch });
                for (const job of batch.jobs) {
                    resp.write(JSON.stringify({ index: job.index, error: new String(e) }) + '\n');
                }
            }
        });
    }
}

function convertJobAsBatch(job: Job, staticMethod: Function): JobBatch {
    return { jobs: [job], execute: async (scene) => {
        job.result = await staticMethod(scene, ...job.args);
    }}
}

function createSpanFromHeaders(
    headers: Record<string, string> | NodeJS.Dict<string | string[]>,
): Span | undefined {
    if (!headers) {
        return undefined;
    }
    const traceId = headers['x-b3-traceid'] as string;
    if (!traceId) {
        return undefined;
    }
    const baggage: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (k.startsWith('baggage-') && typeof v === 'string') {
            baggage[k.substr('baggage-'.length)] = v;
        }
    }
    const spanId = headers['x-b3-spanid'] as string;
    const parentSpanId = headers['x-b3-parentspanid'] as string;
    return {
        traceId,
        parentSpanId,
        spanId,
        baggage: baggage,
        traceOp: baggage['op'],
        props: {},
    };
}
