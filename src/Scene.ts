import { reportEvent, Span } from './tracing';
import { useLog } from './useLog';

// Scene 生命周期的 trace 日志
export const REALM_SCENE = Symbol();
const trace = useLog(REALM_SCENE);
// 依赖追踪的 trace 日志，这个日志频率非常高
export const REALM_REACTIVE = Symbol();
const reactive_trace = useLog(REALM_REACTIVE);

// 界面渲染的过程中要需要读取数据，也就是使用Atom
// 这个渲染的过程要把自己做为 AtomReader 加入到 Scene 里
// 从而收集到所有读取过的 Atom
export interface AtomReader {
    onAtomRead(atom: Atom): void;
}

// 如果界面读取了数据库某个表，界面就是 AtomSubscriber
// 当表被写入了之后，订阅了的界面需要被重新渲染
export interface AtomSubscriber {
    // Atom 通知 AtomSubscriber 自己被 span 改了
    onAtomChanged(span: Span): void;
}

// 如果界面读取了数据库某个表，这张表就是一个被订阅的 Atom
// 当表被写入了之后，订阅了的界面需要被重新渲染
// Atom 是一个 interface 而不是一个 concrete class 是为了方便 ActiveRecord class 直接实现 Atom 接口
// Atom 是对异步的可订阅物，以及同步的可订阅物的综合抽象
export interface Atom {
    // 不是所有的 Atom 都是表，有一些纯内存中的订阅没有 tableName
    // 比如对浏览器的 window.location.hash 的订阅就没有分配 tableName
    // tableName 用来 RPC 跨进程传递订阅关系
    tableName?: string;
    // 以下三个方法一般都是用 SimpleAtom 来实现的
    addSubscriber(subscriber: AtomSubscriber): void;
    deleteSubscriber(subscriber: AtomSubscriber): void;
    onAtomChanged(span: Span): void;
}

// Atom 的默认基础实现，大部分 Atom 都是继承自 SimpleAtom
export class SimpleAtom {
    private readonly subscribers = new Set<AtomSubscriber>();

    public addSubscriber(subscriber: AtomSubscriber) {
        reactive_trace`addSubscriber: ${subscriber} subscribe ${this}`;
        this.subscribers.add(subscriber);
    }
    public deleteSubscriber(subscriber: AtomSubscriber) {
        reactive_trace`deleteSubscriber: ${subscriber} unsubscribe ${this}`;
        this.subscribers.delete(subscriber);
    }
    public onAtomChanged(span: Span) {
        if (this.subscribers.size === 0) {
            reactive_trace`notifyChange: ${span.traceOp} notify ${this} changed, but there is no subscriber`;
            return;
        }
        reactive_trace`notify ${this} changed`;
        for (const subscriber of this.subscribers) {
            subscriber.onAtomChanged(span);
        }
    }
}

// Entity class 就实现了 Table 接口
export interface Table<T = any> extends Atom {
    new (): T;
    tableName: string;
    create(props: Partial<T>): object;
}

export function isTable(o: any): o is Table {
    return !!o.tableName;
}

// 提供对各种 Table 的增删改查，适配各种类型的关系数据库
export interface Database {
    // 会自动触发 table 的变更通知
    // 返回的实例对象有 update/delete 的能力
    insert(scene: Scene, table: Table, props: Record<string, any>): Promise<any>;
    // 只支持 = 和 AND 关系
    // 会自动对 table 进行订阅
    // 返回的实例对象有 update/delete 的能力
    query(scene: Scene, table: Table, props: Record<string, any>): Promise<any[]>;
    // 更新
    update(scene: Scene, table: Table, props: Record<string, any>): Promise<void>;
    // 删除
    delete(scene: Scene, table: Table, props: Record<string, any>): Promise<void>;
    // 执行任意 SQL
    // Database 的实现不会解析 sql 去订阅 Table，需要调用 executeSql 的地方自己去完成订阅
    executeSql(scene: Scene, sql: string, sqlVars: Record<string, any>): Promise<any[]>;
    beginTransaction(scene: Scene): Promise<void>;
    commit(scene: Scene): Promise<void>;
    rollback(scene: Scene): Promise<void>;
    onSceneFinished(scene: Scene): Promise<void>;
}

export interface ServiceRequest {
    /**
     * 服务名
     */
    serviceName: string;
    /**
     * 服务的 tcp 端口
     */
    servicePort: number;
    /**
     * 租户名
     */
    tenantName: string;
    /**
     * token等上下文参数
     */
    context: Record<string, any>;
    /**
     * RPC 方法
     */
    methodName: string;
    /**
     * RPC 参数
     */
    args: any[];
}

// 提供远程方法调用的具体实现
export interface Service {
    /**
     * @param scene 传递了 trace 信息
     * @param request RPC 请求
     * @returns RPC 返回值
     * @throws 远端如果有抛异常，也会在本地重新抛出（当然堆栈信息丢失了）
     */
    callMethod(scene: Scene, request: ServiceRequest): Promise<any>;
    onSceneFinished(scene: Scene): Promise<void>;
}

export interface SpanSpi extends Span {
    onError?: (e: any) => void;
    onSceneExecuting?: (scene: Scene) => Promise<any>;
}

export interface SceneConf {
    service: Service;
    // 如果 RPC 的时候没有指定 tenant，默认取这里的设置
    tenants: Record<string, string>;
    // key 是 serviceName/tenantName
    // value 是 RPC 传递的 context
    contexts: Record<string, Record<string, any>>;
    // 默认情况下，scene 是不会触发变更通知的
    // 在创建了 scene 之后，要配置 scene 执行过程中如果发现 atom 被修改了该怎么办
    // 1. 透传给其他 scene（比如通过 RPC 传递）
    // 2. 触发 atom 变更通知，从而触发 subscriber 刷新
    // 3. 只读的操作禁止修改数据，应该抛异常
    // 选择哪种方式要看这个 scene 的创建者所要执行任务的意图
    onAtomChanged: (scene: Scene, atom: Atom) => void;
}

// STATUS_INIT -> STATUS_EXECUTING -> STATUS_FINISHED
const STATUS_INIT = 0;
const STATUS_EXECUTING = 1;
const STATUS_FINISHED = 2;

// 每个异步执行流程（async function）会创建一个独立的 scene，用来跟踪异步操作与I/O的订阅关系
// 后端 handle 一个 http 请求，后端不开启订阅
// 前端计算每个 future 的值（读操作），捕捉订阅关系
// 前端处理一次鼠标点击（写操作），触发订阅者
export class Scene {
    // 默认使用 project 名字做为域名进行服务发现，端口在代码写死
    // 如果需要额外重定向，需要全局注册该回调
    // 其他外部服务也可以当成 project 来对待，比如 project=redis, port=6379
    public static serviceDiscover = (
        serviceName: string,
        servicePort: number,
    ): { host: string; port: number } => {
        if (!servicePort) {
            throw new Error('do not know how to route service ' + serviceName);
        }
        return { host: serviceName, port: servicePort };
    };

    // 当前正在执行的 reader，遇到的 atom 要订阅上它们
    // 一个 scene 的执行过程中可能执行了多个嵌套的 async function
    // 每个 async function 都可能会在开始执行的时候把自己的 reader 加入进来
    // 然后在函数执行完毕之后再把 reader 从这里删掉
    private activeReaders?: Set<AtomReader>;

    // 用来防止 scene.execute 之外误用 scene
    private status: 0 | 1 | 2 = STATUS_INIT;

    // 当前 scene.execute 执行的任务
    public executing?: Promise<any>;

    public readonly conf: SceneConf;

    constructor(public readonly span: SpanSpi, conf: Partial<SceneConf>) {
        this.conf = {
            service: conf.service || {
                async callMethod() {
                    throw new Error('not implemented');
                },
                async onSceneFinished() {},
            },
            tenants: conf.tenants || {},
            contexts: conf.contexts || {},
            onAtomChanged: conf.onAtomChanged || (() => {})
        }
    }

    /**
     * @param theThis 执行 task 函数时传递的 this 参数
     * @param task 要执行的函数，可能是 async 的
     * @param args 给函数的参数数组
     * @returns 函数执行返回值的 promise
     */
    public execute<T extends (...args: any[]) => any>(
        theThis: any,
        task: T,
        ...args: Parameters<OmitFirstArg<T>>
    ): ReturnType<T> {
        this.executing = (async () => {
            this.status = STATUS_EXECUTING;
            const isReader = theThis && theThis.onAtomRead;
            if (isReader) {
                if (!this.activeReaders) {
                    this.activeReaders = new Set();
                }
                this.activeReaders.add(theThis);
            }
            try {
                // 如果是 async 函数，trace.execute 只会覆盖其执行的第一个 step
                // 后续的 async 执行不会包裹在 trace.execute 内
                return await trace.execute(`span ${this.span.traceOp} scene.execute`, () =>
                    task.call(theThis, this, ...args),
                );
            } finally {
                if (this.conf.service) {
                    try {
                        await this.conf.service.onSceneFinished(this);
                    } catch (e) {
                        reportEvent(
                            'failed to call database.onSceneFinished',
                            { error: e },
                            this.span,
                        );
                    }
                }
                if (isReader && this.activeReaders) {
                    this.activeReaders.delete(theThis);
                }
                if (this.activeReaders && this.activeReaders.size > 0) {
                    reportEvent(
                        'detected activeReaders not empty after scene finished',
                        {},
                        this.span,
                    );
                }
                // 无论是否抛出异常，执行都算结束了
                // 即便要重试，也应该创建一个新的 scene
                this.executing = undefined;
                this.status = STATUS_FINISHED;
            }
        })();
        // span 的其他 scene 可能希望等该 span 的所有 scene 都执行完毕再干点事情
        // 把执行的 scene 通知出来，让关心的地方可以知道有多少异步 scene 正在执行
        if (this.span.onSceneExecuting) {
            this.span.onSceneExecuting!(this);
        }
        return this.executing as any;
    }

    private assertExecuting() {
        if (this.status === STATUS_EXECUTING) {
            return;
        }
        if (this.status === STATUS_INIT) {
            throw new Error('should call scene.execute to enter executing status');
        } else if (this.status === STATUS_FINISHED) {
            throw new Error('scene can not be reused, do not save it persistenly');
        } else {
            throw new Error('scene is not executing');
        }
    }

    // 把自己注册到 scene 上以获得 onAtomRead 的回调
    public async trackAtomRead<T>(reader: AtomReader, cb: () => Promise<T>): Promise<T> {
        if (!this.activeReaders) {
            this.activeReaders = new Set();
        }
        this.activeReaders.add(reader);
        try {
            return await cb();
        } finally {
            this.activeReaders.delete(reader);
        }
    }

    // 给 Database, ServiceProtocol 的实现来通知 scene 自己 I/O 读了哪些表
    public onAtomRead(atom: Atom) {
        this.assertExecuting();
        if (this.activeReaders) {
            for (const reader of this.activeReaders) {
                reader.onAtomRead(atom);
            }
        }
    }

    public onAtomChanged(atom: Atom) {
        return this.conf.onAtomChanged(this, atom);
    }

    public reportEvent(message: string, event: Record<string, any>) {
        reportEvent(message, event, this.span);
    }

    /**
     * @param project 要调用的目标 project，如果不传默认调用当前 project 对应的后端代码
     * @returns RPC 调用的 proxy
     */
    public useService<T extends { project: any }>(
        ...project: T['project']
    ): {
        [P in MethodsOf<T>]: (...a: Parameters<OmitFirstArg<T[P]>>) => ReturnType<T[P]>;
    };
    public useService<T extends { project: any }>(
        serviceName: T['project'][0],
        servicePort: 0,
        tenantName?: string,
    ): {
        [P in MethodsOf<T>]: (...a: Parameters<OmitFirstArg<T[P]>>) => ReturnType<T[P]>;
    };
    public useService<T extends { project: any }>(
        serviceName: string,
        servicePort: number,
        overridingTenantName?: string,
        overridingContext?: Record<string, any>,
    ): {
        [P in MethodsOf<T>]: (...a: Parameters<OmitFirstArg<T[P]>>) => ReturnType<T[P]>;
    } {
        this.assertExecuting();
        const scene = this;
        // proxy intercept property get, returns rpc stub
        const get = (target: object, propertyKey: string, receiver?: any) => {
            return (...args: any[]) => {
                const tenantName = overridingTenantName || this.conf.tenants[serviceName];
                if (!tenantName) {
                    throw new Error('target tenantName is unknown');
                }
                const context = overridingContext || this.conf.contexts[`${serviceName}/${tenantName}`];
                return scene.conf.service.callMethod(scene, {
                    serviceName,
                    servicePort,
                    tenantName,
                    context,
                    methodName: propertyKey,
                    args,
                });
            };
        };
        return new Proxy({}, { get }) as any;
    }

    public useDatabase() {
        return this.useService<Database & { project: ['db', 0] }>('db', 0);
    }

    /**
     * @param table 一般是 ActiveRecord 的 class
     * @param props 列的初始值
     * @returns 刚插入的数据，其上有 update/delete 的方法
     */
    public create<T>(table: Table<T>, props: Partial<FieldsOf<T>>): Promise<T> {
        this.assertExecuting();
        const createFunc = Reflect.get(table, `create${table.tableName}`);
        if (createFunc) {
            return createFunc(this, props);
        }
        throw new Error(`create${table.tableName} not defined in class`);
    }
    /**
     * 简单的单表查询，不能满足的用 io.database.executeSql 表达
     * @param table 一般是 ActiveRecord 的 class
     * @param props key=value，且的关系
     * @returns 数组
     */
    public query<T>(table: Table<T>, props: Partial<T>): Promise<T[]>;
    /**
     * 语法糖，免得写 func(scene, ...args)，而是 scene.query(func, ...args)
     * @param func 查询方法
     * @param args 给方法的阐述
     * @returns 数组
     */
    public query<T, F extends (scene: Scene, ...args: any[]) => Promise<T[]>>(
        func: F,
        ...args: Parameters<OmitFirstArg<F>>
    ): Promise<T[]>;
    public query(arg1: any, ...remainingArgs: any[]) {
        this.assertExecuting();
        if (!isTable(arg1)) {
            return arg1(this, ...remainingArgs);
        }
        const table = arg1;
        const queryFunc = Reflect.get(table, `query${table.tableName}`);
        if (queryFunc) {
            return queryFunc(this, ...remainingArgs);
        }
        throw new Error(`query${table.tableName} not defined in class`);
    }
    // 和 query 一样，但是要求返回数组有且仅有一个元素
    public async load<T>(table: Table<T>, props: Partial<T>): Promise<T> {
        this.assertExecuting();
        const loadFunc = Reflect.get(table, `load${table.tableName}`);
        if (loadFunc) {
            return loadFunc(this, props);
        }
        throw new Error(`load${table.tableName} not defined in class`);
    }
    // 和 load 一样，但是查询条件只能是 id，或者没有任何条件
    // 当没有任何条件的时候，假设指定表是单例的
    public async get<T>(table: Table<T>, id?: any): Promise<T> {
        this.assertExecuting();
        const getFunc = Reflect.get(table, `get${table.tableName}`);
        if (getFunc) {
            return getFunc(this, id);
        }
        throw new Error(`get${table.tableName} not defined in class`);
    }
    // sleep 延迟的毫秒数 (一秒等于1000毫秒)
    public async sleep(ms: number) {
        this.assertExecuting();
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    public toJSON() {
        return undefined;
    }
    get [Symbol.toStringTag]() {
        return `{S traceId=${this.span.traceId} traceOp=${this.span.traceOp}}`;
    }
}

type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;

// copied from https://stackoverflow.com/questions/55479658/how-to-create-a-type-excluding-instance-methods-from-a-class-in-typescript

// 1 Transform the type to flag all the undesired keys as 'never'
type FlagExcludedType<Base, Type> = { [Key in keyof Base]: Base[Key] extends Type ? never : Key };

// 2 Get the keys that are not flagged as 'never'
type AllowedNames<Base, Type> = FlagExcludedType<Base, Type>[keyof Base];

// 3 Use this with a simple Pick to get the right interface, excluding the undesired type
type OmitType<Base, Type> = Pick<Base, AllowedNames<Base, Type>>;

// 4 Exclude the Function type to only get properties
type FieldsOf<T> = OmitType<T, Function>;

type MethodsOf<T> = {
    [P in keyof T]: T[P] extends (...a: any) => any ? P : never;
}[keyof T];
