import { useTrace } from './useTrace';
import * as assert from 'assert';

const trace = useTrace(Symbol.for('test'));
const old = { ...useTrace };
const output: string[] = [];

describe('useTrace', () => {
    before(() => {
        useTrace.shouldTrace = () => true;
        useTrace.output = output.push.bind(output);
    });
    beforeEach(() => {
        output.length = 0;
    });
    after(() => {
        useTrace.shouldTrace = old.shouldTrace;
        useTrace.output = old.output;
    });
    it('trace outside execute', () => {
        trace`hello`;
        assert.deepStrictEqual(output, ['hello']);
    });
});
