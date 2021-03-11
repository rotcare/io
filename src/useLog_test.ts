import { useLog } from './useLog';
import { strict } from 'assert';

const log = useLog(Symbol());
const old = { ...useLog };
const output: string[] = [];

describe('useLog', () => {
    before(() => {
        useLog.shouldLog = () => true;
        useLog.output = output.push.bind(output);
    });
    beforeEach(() => {
        output.length = 0;
    });
    after(() => {
        useLog.shouldLog = old.shouldLog;
        useLog.output = old.output;
    });
    it('log outside execute', () => {
        log`hello`;
        strict.deepEqual(output, ['hello']);
    });
    it('log object', () => {
        log`hello ${{
            get [Symbol.toStringTag]() {
                return 'some';
            },
        }}`;
        strict.deepEqual(output, ['hello [object some]']);
    });
    it('log inside execute', () => {
        log.execute('some job', () => {
            log`hello`;
            log`world`;
        });
        strict.deepEqual(output, ['some job', ['hello', 'world']]);
    });
    it('log.execute nested', () => {
        log.execute('some job', () => {
            log.execute('more job', () => {});
        });
        strict.deepEqual(output, ['some job', ['>>> more job', '<<< more job']]);
    });
});
