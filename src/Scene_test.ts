import { strict } from 'assert';
import { Gateway } from './Archetype/Gateway';
import { newTrace } from './newTrace';
import { Atom, AtomReader, Scene, SimpleAtom } from './Scene';

class SomeGateway extends Gateway {
    public static doSomething() {}
}
describe('Scene', () => {
    it('追踪异步函数所读过的数据表，流程示意', async () => {
        const someTable = new SimpleAtom();
        // 1. 先构造一个 scene 对象
        const scene = new Scene(newTrace('test'), {
            database: undefined as any,
            serviceProtocol: {
                async callService() {
                    // 5. 告诉当前的 readers，你读到了这张表了
                    scene.onAtomRead(someTable);
                },
            },
        });
        // 2. 用 scene 来跟踪 async function 的执行
        const atoms = await scene.execute(undefined, async function (scene: Scene) {
            // 用把 subscriber 注入到 scene 的方式，实现对 scene 执行过程中的 atom 的监听
            const atoms: Atom[] = [];
            const reader: AtomReader = {
                // 6. 当 I/O 读取了之后，会触发这里记录读到的 atom
                onAtomRead(atom) {
                    atoms.push(atom);
                }
            };
            // 3. 把 async function 可能会不止一个地方需要跟踪读取数据
            // 每个地方都用 trackAtomRead 包起来
            await scene.trackAtomRead(reader, async() => {
                return await anotherAsyncFunction(scene);
            });
            return atoms;
        });
        async function anotherAsyncFunction(scene: Scene) {
            // 4. 只要是通过 scene 做的操作，无论传了几层，传给了哪个函数
            // 其产生的 I/O 都会触发 onAtomRead
            return await scene.useServices<typeof SomeGateway>().doSomething();
        }
        strict.deepEqual(atoms, [someTable]);
    });
});
