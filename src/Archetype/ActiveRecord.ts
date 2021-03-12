import { AtomSubscriber, Scene, SimpleAtom, Span, Table } from "../Scene";

// 数据库表
export class ActiveRecord {
    public static IS_ACTIVE_RECORD = true as true;
    public static tableName: string;

    // 以下被 Database 的实现给注入
    protected update: () => Promise<void>;
    protected delete: () => Promise<void>;
    protected scene: Scene;

    public get class() {
        return this.constructor as typeof ActiveRecord;
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

class TableAtom extends SimpleAtom {
    constructor(private readonly tableName: string) {
        super();
    }
    get [Symbol.toStringTag]() {
        return `{TableAtom ${this.tableName}}`
    }
}