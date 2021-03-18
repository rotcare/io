import { Database, Scene, Table } from '../Scene';

// 用内存模拟数据库
export class InMemDatabase implements Database {
    private tables: Map<Table, Map<string, Record<string, any>>> = new Map();

    public async insert(scene: Scene, table: Table, props: Record<string, any>): Promise<any> {
        const obj = table.create(props);
        const id = props.id === undefined ? nextId() : props.id;
        Object.assign(obj, { ...props, id });
        const records = this.getRecords(table);
        records.set(id, JSON.parse(JSON.stringify(obj)));
        scene.onAtomChanged(table);
        return obj;
    }
    public async query(scene: Scene, table: Table, criteria: Record<string, any>): Promise<any[]> {
        scene.onAtomRead(table);
        const records = this.getRecords(table);
        function isMatch(record: Record<string, any>) {
            for (const [k, v] of Object.entries(criteria)) {
                if (record[k] !== v) {
                    return false;
                }
            }
            return true;
        }
        const objs = [];
        for (const record of records.values()) {
            if (isMatch(record)) {
                objs.push(table.create(record));
            }
        }
        return objs;
    }
    public async update(scene: Scene, table: Table, props: Record<string, any>) {
        const records = this.getRecords(table);
        records.set(props.id, JSON.parse(JSON.stringify(props)));
        scene.onAtomChanged(table);
    }
    public async delete(scene: Scene, table: Table, props: Record<string, any>) {
        const records = this.getRecords(table);
        records.delete(props.id);
        scene.onAtomChanged(table);
    }
    public executeSql(scene: Scene, sql: string, sqlVars: Record<string, any>): Promise<any[]> {
        throw new Error('unsupported');
    }
    private getRecords(table: Table) {
        let records = this.tables.get(table);
        if (!records) {
            this.tables.set(table, (records = new Map()));
        }
        return records;
    }
}

let currentId = 1000;
function nextId() {
    return `~${currentId++}`;
}
