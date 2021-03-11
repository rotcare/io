import { ActiveRecord } from "../Archetype/ActiveRecord";
import { Scene } from "../Scene";
import { InMemDatabase } from "./InMemDatabase";
import { strict } from 'assert';
import { newTrace } from "../newTrace";

describe('InMemDatabase', () => {
    it('增删改查', async () => {
        class Product extends ActiveRecord {
            id: string;
            name: string;
            price?: number;

            public updatePrice(newPrice: number) {
                this.price = newPrice;
                this.update();
            }

            public deleteMe() {
                return this.delete();
            }
        }
        const database = new InMemDatabase();
        const scene = new Scene(newTrace('test'), {
            database,
            serviceProtocol: undefined as any
        });
        await scene.execute(undefined, async() => {
            const apple = await scene.insert(Product, { name: 'apple' });
            strict.ok(apple.id);
            apple.updatePrice(100);
            strict.equal((await scene.query(Product, { price: 100 })).length, 1);
            await apple.deleteMe();
            strict.equal((await scene.query(Product, {})).length, 0);
        })
    })
})