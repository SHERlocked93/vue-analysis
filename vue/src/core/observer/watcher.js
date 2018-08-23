/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * 一个解析表达式，进行依赖收集的观察者，同时在表达式数据变更时触发回调函数。它被用于$watch api以及指令
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  computed: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  dep: Dep
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before: ?Function
  getter: Function
  value: any
  
  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean           // 是否是渲染watcher的标志位
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)                   // _watchers存放所有watcher实例
    // options
    if (options) {
      this.deep = !!options.deep              // 侦听器配置
      this.user = !!options.user
      this.computed = !!options.computed      // 计算属性配置
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers 用来判断是否需要重新求值
    this.deps = []             // 上一次添加的Dep实例
    this.newDeps = []          // 新添加的Dep实例
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
                      ? expOrFn.toString()
                      : ''
    // parse expression for getter，把表达式expOrFn解析成getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn             // 在get方法中执行
    } else {
      this.getter = parsePath(expOrFn)  // 侦听器为字符串 a.b.c
      if (!this.getter) {
        this.getter = function() {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    if (this.computed) {                        // 是否是 计算属性
      this.value = undefined
      this.dep = new Dep()                      // 计算属性创建过程中并未求值
    } else {                                    // 不是计算属性会立刻求值
      this.value = this.get()
    }
  }
  
  /**
   * 获得getter的值并且重新进行依赖收集
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    pushTarget(this)                // 推入当前要订阅变化的watcher
    let value
    const vm = this.vm
    
    try {
      value = this.getter.call(vm, vm)        // 第二个参数给parsePath返回函数
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as dependencies for deep watching
      if (this.deep) {      // 如果存在deep，则触发每个深层对象的依赖，追踪其变化
        traverse(value)     // 递归每一个对象或者数组，触发它们的getter，使得对象或数组的每一个成员都被依赖收集，形成深deep依赖关系
      }
      popTarget()           // 将观察者实例从target栈中取出并设置给Dep.target
      this.cleanupDeps()
    }
    return value
  }
  
  /**
   * 添加一个依赖关系到Deps集合中
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }
  
  /**
   * 清理newDeps里没有的无用watcher依赖
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length    // 移除无用观察者对象
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }
  
  /* Subscriber接口，当依赖发生改变的时候进行回调 */
  update() {
    if (this.computed) {
      // 一个computed watcher有两种模式：activated lazy(默认)
      // 只有当它被至少一个订阅者依赖时才置activated，这通常是另一个计算属性或组件的render function
      if (this.dep.subs.length === 0) {       // 如果没人订阅这个计算属性的变化
        // lazy时，我们希望它只在必要时执行计算，所以我们只是简单地将观察者标记为dirty
        // 当计算属性被访问时，实际的计算在this.evaluate()中执行
        this.dirty = true
      } else {
        // activated模式下，我们希望主动执行计算，但只有当值确实发生变化时才通知我们的订阅者
        this.getAndInvoke(() => {
          this.dep.notify()           // 通知渲染watcher重新渲染，通知依赖自己的所有watcher执行update
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)              // 异步推送到调度者观察者队列中，下一个tick时调用
    }
  }
  
  /**
   * 调度者工作接口，将被调度者回调
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }
  
  getAndInvoke(cb: Function) {
    const value = this.get()
    if (
      value !== this.value ||                         // 计算值如果和原值一样，则不执行渲染回调
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      const oldValue = this.value         // set new value
      this.value = value
      this.dirty = false
      if (this.user) {                    // user watcher
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }
  
  /**
   * 收集该watcher的所有deps依赖
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  evaluate() {
    if (this.dirty) {
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }
  
  /**
   * 收集该watcher的所有deps依赖，只有计算属性使用
   * Depend on this watcher. Only for computed property watchers.
   */
  depend() {
    if (this.dep && Dep.target) {       // 计算属性在视图被访问时，target为render func
      this.dep.depend()
    }
  }
  
  /**
   * 将自身从所有依赖收集订阅列表删除
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
