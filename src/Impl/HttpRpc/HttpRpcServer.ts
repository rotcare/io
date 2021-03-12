import type { ServerResponse, IncomingMessage } from 'http';
import { newTrace } from '../../newTrace';
import { Atom, AtomReader, IoConf, Scene, Span } from '../../Scene';
import { Job } from './HttpRpc';

export class HttpRpcServer {
    constructor(
        private readonly options: { ioConf: IoConf },
        private readonly moduleProvider: () => Promise<any>,
        private readonly className: string,
        private readonly staticMethodName: string,
    ) {}
    public get handler() {
        return async (req: IncomingMessage, resp: ServerResponse) => {
            try {
                const staticMethodPromise = this.staticMethod();
                let reqBody = '';
                req.on('data', (chunk) => {
                    reqBody += chunk;
                });
                await new Promise((resolve) => req.on('end', resolve));
                const staticMethod = await staticMethodPromise;
                resp.writeHead(200, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                    'X-Content-Type-Options': 'nosniff',
                });
                const jobs: Job[] = JSON.parse(reqBody) || [];
                const span = createSpanFromHeaders(req.headers) || newTrace(`handle ${req.url}`);
                const promises = jobs.map((job, index) => this.execute({staticMethod, index, job, span, resp}));
                await Promise.all(promises);
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
    
    private async execute(
        options: {
            staticMethod: Function,
            index: number,
            job: Job,
            span: Span,
            resp: ServerResponse
        }
    ) {
        const { index, job, span, resp, staticMethod } = options;
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
                const result = await staticMethod(scene, ...options.job);
                resp.write(JSON.stringify({ indices: [index], data: result, read, changed }) + '\n');
            } catch (e) {
                console.error(`failed to handle: ${JSON.stringify(job)}\n`, e);
                resp.write(JSON.stringify({ indices: [index], error: new String(e) }) + '\n');
            }
        });
    }
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
