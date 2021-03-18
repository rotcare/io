import { Scene } from "../Scene";
import { InMemDatabase } from "./InMemDatabase";
import { strict } from 'assert';
import { newTrace } from "../tracing";
import { Entity } from "../Archetype/Entity";

describe('InMemDatabase', () => {
    it('增删改查', async () => {
        class Product extends Entity {
            id: string;
            name: string;
            price?: number;
            public static async createProduct(scene: Scene, props: Partial<Product>) {
                return await scene.io.database.insert(scene, Product, props);
            }
            public static async queryProduct(scene: Scene, props: Partial<Product>) {
                return await scene.io.database.query(scene, Product, props);
            }
            public async updatePrice(scene: Scene, newPrice: number) {
                this.price = newPrice;
                await scene.io.database.update(scene, this.table, this);
            }
            public async deleteMe(scene: Scene) {
                await scene.io.database.delete(scene, this.table, this);
            }
        }
        const database = new InMemDatabase();
        const scene = new Scene(newTrace('test'), {
            database,
            serviceProtocol: undefined as any
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