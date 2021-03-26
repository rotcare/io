import { Scene } from "./Scene";
import { InMemDatabase } from "./InMemDatabase";
import { strict } from 'assert';
import { newTrace } from "./tracing";
import { Entity } from "./Entity";
import { ServiceDispatcher } from "./ServiceDispatcher";

describe('InMemDatabase', () => {
    it('增删改查', async () => {
        class Product extends Entity {
            id: string;
            name: string;
            price?: number;
            public static async createProduct(scene: Scene, props: Partial<Product>) {
                return await scene.useDatabase().insert(Product, props);
            }
            public static async queryProduct(scene: Scene, props: Partial<Product>) {
                return await scene.useDatabase().query(Product, props);
            }
            public async updatePrice(scene: Scene, newPrice: number) {
                this.price = newPrice;
                await scene.useDatabase().update(this.table, this);
            }
            public async deleteMe(scene: Scene) {
                await scene.useDatabase().delete(this.table, this);
            }
        }
        const database = new InMemDatabase();
        const scene = new Scene(newTrace('test'), {
            tenants: { db: 'default' },
            service: new ServiceDispatcher(database, undefined as any),
        });
        await scene.execute(undefined, async() => {
            const apple = await scene.create(Product, { name: 'apple' });
            strict.ok(apple.id);
            await apple.updatePrice(scene, 100);
            strict.equal((await scene.query(Product, { price: 100 })).length, 1);
            await apple.deleteMe(scene);
            strict.equal((await scene.query(Product, {})).length, 0);
        })
    })
})