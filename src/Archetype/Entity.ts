import { AtomSubscriber, EntitySpi, SimpleAtom, Span, Table } from "../Scene";

// 数据库表
export class Entity implements EntitySpi {
    public static IS_ENTITY = true as true;
    public static tableName: string;

    // 以下被 Database 的实现给注入
    protected update: () => Promise<void>;
    protected delete: () => Promise<void>;
    // @internal
    public onLoad(options: {
        update: () => Promise<void>;
        delete: () => Promise<void>;
    }) {
        this.update = options.update;
        this.delete = options.delete;
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
}

// tableName 如果没有设置，默认取 name 的值做为表名
Object.defineProperty(Entity, 'tableName', {
    get(this: typeof Entity) {
        if ((this as any)._tableName) {
            return (this as any)._tableName;
        }
        return this.name;
    },
    set(this: typeof Entity, newName: string) {
        (this as any)._tableName = newName;
    }
})

class TableAtom extends SimpleAtom {
    constructor(private readonly tableName: string) {
        super();
    }
    get [Symbol.toStringTag]() {
        return `{TableAtom ${this.tableName}}`
    }
}