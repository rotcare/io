/**
 * 以下为可替换的实现代码，不要和这些定义强耦合
 */
export * from './InMemDatabase';
export * from './BatchExecutor';
export * from './HttpRpc/HttpRpcClient';
export * from './HttpRpc/HttpRpcServer';
import * as HttpRpc from './HttpRpc/HttpRpc';
export { HttpRpc }