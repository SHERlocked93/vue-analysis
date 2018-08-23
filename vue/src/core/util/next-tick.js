/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []          // 存放异步执行的回调
let pending = false           // 一个标记位，如果已经有timerFunc被推送到任务队列中去则不需要重复推送

/* 挨个同步执行callbacks中回调 */
function flushCallbacks() {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// 这里我们使用微任务和宏任务来异步延迟包装器。
// 在2.4之前的版本中，nextTick基本上基于microtask来实现的，但是在某些情况下microtask具有太高的优先级
// ，并且可能在连续顺序事件（例如＃4521，＃6690）之间或者甚至在同一事件的事件冒泡过程中（＃6566）之间触发。
// 但是如果全部都改成macrotask，对一些有重绘和动画的场景也会有性能影响，如 issue #6813。
// 这里提供的解决办法是默认使用microtask，但在需要时（例如在v-on附加的事件处理程序中）强制使用macrotask
// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc        // 微任务执行方法
let macroTimerFunc        // 宏任务执行方法
let useMacroTask = false  // 是否强制为宏任务

// 宏任务 Determine (macro) task defer implementation.
// 技术上setImmediate是理想的选择，但它只在IE中可用
// 在同一个loop中所有DOM事件触发之后始终对回调queue唯一的polyfill是MessageChannel
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  MessageChannel.toString() === '[object MessageChannelConstructor]'  // PhantomJS
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// 微任务 Determine microtask defer implementation.
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // 用Promise模拟的，但是在iOS UIWebViews中有个bug，Promise.then并不会被触发
    // 除非浏览器中有其他事件触发，例如处理setTimeout。所以手动加了个空的setTimeout
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else {
  microTimerFunc = macroTimerFunc      // fallback to macro
}

/**
 * 强制使用宏任务
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask(fn: Function): Function {
  return fn._withTask || (fn._withTask = function() {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc()      // 第一次调用nextTick的时候已经push了一个宏任务/微任务队列，如果没有flush掉的情况下继续往callbacks
    } else {                // 里面添加，那么在执行这个队列的时候会执行之后添加的回调，所以这个相当于task queue的占位，占了以后
      microTimerFunc()      // pending为true的时候可以继续往占位queue里面添加，event loop轮到这个task queue的时候将一并执行。
    }
  }
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
