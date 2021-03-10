import { useTrace } from './useTrace';
import { strict } from 'assert';

const trace = useTrace(Symbol());
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
        strict.deepEqual(output, ['hello']);
    });
    it('trace obj', () => {
        trace`hello ${{
            get [Symbol.toStringTag]() {
                return 'some';
            },
        }}`;
        strict.deepEqual(output, ['hello [object some]']);
    });
    it('trace inside execute', () => {
        trace.execute('some job', () => {
            trace`hello`;
            trace`world`;
        });
        strict.deepEqual(output, ['some job', ['hello', 'world']]);
    });
    it('trace.execute nested', () => {
        trace.execute('some job', () => {
            trace.execute('more job', () => {});
        });
        strict.deepEqual(output, ['some job', ['>>> more job', '<<< more job']]);
    });
});
