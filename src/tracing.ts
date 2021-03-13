// 分布式追踪包括三层 trace -> span -> scene
// 一个 trace 会有多个进程被多次执行，每次执行是一个 span
// 一个 span 会包含一个或者多个 scene
// 浏览器进入首次渲染，是一个 span
// 每次鼠标点击，触发重渲染，也是一个 span。此时因为可能触发多处重渲染，所以会触发多个 scene
// 后端 handle 一个 http 请求也是一个 span（但是和前端的 span 共享 trace 信息）
export interface Span {
      // traceId, traceOp, baggage 会 RPC 透传
      traceId: string;
      traceOp: string;
      baggage: Record<string, any>;
      //  RPC 的时候会把当前的 spanId 设置为 parentSpanId，并分配一个新的 spanId
      parentSpanId?: string;
      spanId: string;
      // 以下字段仅在进程内，不会 RPC 透传
      props: Record<string, any>;
}

/**
 * 结构化日志接口，生产环境下会全量输出到 zipkin
 * @param msg 发生了什么事情
 * @param event 用 kv 描述这个事情的详情
 * @param span 是不是附着在已有的一个 span 下做为子 span 上报，还是新起一条 trace
 */
export const reportEvent = (msg: string, event: Record<string, any>, span?: Span) => {
  reportEvent.output(msg, event, span);
}
reportEvent.output = console.error;
// 一般是在前端进程产生一个全新的 trace
export function newTrace(traceOp: string): Span {
  // 分布式追踪的 traceId 是在前端浏览器这里分配的，一直会往后传递
  return {
      traceId: uuid(),
      spanId: uuid(),
      traceOp,
      baggage: {},
      props: {},
  };
}

export function newSpan(parentSpan: Span) {
  return {
    traceId: parentSpan.traceId,
    spanId: uuid(),
    parentSpanId: parentSpan.spanId,
    traceOp: parentSpan.traceOp,
    baggage: parentSpan.baggage
  }
}

// copied from uuid
let crypto_ = typeof global !== 'undefined' && ((global as any).crypto || (global as any).msCrypto); // for IE 11
let rng: any;
if (crypto_ && crypto_.getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef
  rng = function whatwgRNG() {
    crypto_.getRandomValues(rnds8);
    return rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r as number >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex: any = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf: any, offset: any = undefined) {
  var i = offset || 0;
  var bth = byteToHex;
  return bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

export function uuid(): string {
    var rnds = rng();
    // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    return bytesToUuid(rnds);
}
