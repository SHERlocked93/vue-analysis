/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}          // 循环更新
let waiting = false
let flushing = false
let index = 0

/**
 * 重置调度者状态
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

/**
 * nextTick的回调函数，在下一个tick时flush掉两个队列同时运行watchers
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  flushing = true
  let watcher, id

  /*
    给queue排序，这样做可以保证：
    1.组件更新的顺序是从父组件到子组件的顺序，因为父组件总是比子组件先创建。
    2.一个组件的user watchers比render watcher先运行，因为user watchers往往比render watcher更早创建
    3.如果一个组件在父组件watcher运行期间被销毁，它的watcher执行将被跳过。 */
  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id)

  /* 不要将length进行缓存，因为在执行处理现有watcher对象期间，更多的watcher对象可能会被push进queue */
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {         // 如果watcher有before则执行
      watcher.before()
    }
    id = watcher.id
    has[id] = null                // 将has的标记删除
    watcher.run()                 // 执行watcher
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {      // 在dev环境下检查是否进入死循环
      circular[id] = (circular[id] || 0) + 1              // 比如user watcher订阅自己的情况
      if (circular[id] > MAX_UPDATE_COUNT) {              // 持续执行了一百次watch代表可能存在死循环
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()      // 给keep-alive用的
  const updatedQueue = queue.slice()

  resetSchedulerState()                       // 重置调度者状态

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)          // 使子组件状态都置成active同时调用activated钩子
  callUpdatedHooks(updatedQueue)              // 调用updated钩子

  // devtool hook
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

/* 当是render watcher时调用updated钩子 */
function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted) {
      callHook(vm, 'updated')
    }
  }
}

/**
 *  在patch期间被激活（activated）的keep-alive组件保存在队列中，是到patch结束以后该队列会被处理
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

/* 使子组件状态都改编成active同时调用activated钩子 */
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * 将一个观察者对象push进观察者队列，在队列中已经存在相同的id则该观察者对象将被跳过，除非它是在队列被刷新时推送
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {       // 检验id是否存在，已经存在则直接跳过，不存在则标记哈希表has，用于下次检验
    has[id] = true
    if (!flushing) {
      queue.push(watcher)      // 如果没有正在flush，直接push到队列中即可
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)   // 插入到第一个待插入watcher的id比当前队列中watcher的id大的位置
    }
    
    // queue the flush
    if (!waiting) {           // 标记是否已传给nextTick
      waiting = true
      nextTick(flushSchedulerQueue)
    }
  }
}
