import { AtomSubscriber, SimpleAtom, Table } from "./Scene";
import { Span } from "./tracing";

// 数据库表
export class Entity {
    public static readonly tableName: string;

    public static create(props: Record<string, any>) {
        const entity = new this();
        Object.assign(entity, props);
        return entity;
    }

    // 这些 static 方法让 ActiveRecord class 自身就是 atom
    public static addSubscriber(subscriber: AtomSubscriber) {
        return this.atom().addSubscriber(subscriber);
    }
    public static deleteSubscriber(subscriber: AtomSubscriber) {
        return this.atom().deleteSubscriber(subscriber);
    }
    public static onAtomChanged(span: Span) {
        return this.atom().onAtomChanged(span);
    }

    private static atom(): Table {
        let atom = (this as any)['_atom'];
        if (!atom) {
            (this as any)['_atom'] = atom = new TableAtom(this.tableName);
        }
        return atom;
    }
    public get table() {
        return this.constructor as typeof Entity;
    }
}

Object.defineProperty(Entity, 'tableName', {
    get(this: typeof Entity) {
        return this.name;
    },
})

class TableAtom extends SimpleAtom {
    constructor(private readonly tableName: string) {
        super();
    }
    get [Symbol.toStringTag]() {
        return `{TableAtom ${this.tableName}}`
    }
}