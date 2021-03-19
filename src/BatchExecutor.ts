// 利用了 javascript 的 promise 和 setTimeout 的排队优先级不同
// setTimeout 会在 promise 能执行的都执行完成之后再执行
// 这样可以让所有的 react 组件渲染都触发完 I/O，收集到了 jobs 里

import { reportEvent } from "./tracing";

// 由 setTimeout 注册的回调再来统一把 jobs 合并起来执行
export class BatchExecutor<T> {
    private jobs: T[] = [];
    private executing?: Promise<void>;
    constructor(
        private readonly batchSizeLimit: number,
        private readonly batchExecute: (batch: T[]) => Promise<void>,
    ) {}
    public enqueue(job: T) {
        this.jobs.push(job);
        if (!this.executing) {
            this.executing = this.execute();
        }
    }
    private async execute() {
        // 攒一批 jobs
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        while (this.jobs.length > 0) {
            await this.executeOnce();
        }
        this.executing = undefined;
    }
    private async executeOnce() {
        const batches = [];
        while (this.jobs.length > 0) {
            batches.push(this.jobs.splice(0, this.batchSizeLimit));
        }
        for (const batch of batches) {
            try {
                await this.batchExecute(batch);
            } catch (e) {
                reportEvent(`did not expect batchExecute to throw exception`, { error: e })
            }
        }
    }
}
