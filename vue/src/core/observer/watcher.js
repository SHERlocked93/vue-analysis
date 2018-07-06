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
    /* _watchers存放订阅者实例 */
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
                      ? expOrFn.toString()
                      : ''
    // parse expression for getter，把表达式expOrFn解析成getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
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
    pushTarget(this)
    let value
    const vm = this.vm
    
    // 执行了getter操作，看似执行了渲染操作，其实是执行了依赖收集。
    // 在将Dep.target设置为自生观察者实例以后，执行getter操作。
    // 譬如说现在的的data中可能有a、b、c三个数据，getter渲染需要依赖a跟c，
    // 那么在执行getter的时候就会触发a跟c两个数据的getter函数，
    // 在getter函数中即可判断Dep.target是否存在然后完成依赖收集，
    // 将该观察者对象放入闭包中的Dep的subs中去。
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as dependencies for deep watching
      if (this.deep) {   // 如果存在deep，则触发每个深层对象的依赖，追踪其变化
        traverse(value)  // 递归每一个对象或者数组，触发它们的getter，使得对象或数组的每一个成员都被依赖收集，形成深deep依赖关系
      }
      popTarget()        // 将观察者实例从target栈中取出并设置给Dep.target
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
   * 清理依赖收集
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length    // 移除所有观察者对象
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
  
  /**
   * 调度者接口，当依赖发生改变的时候进行回调。
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => {
          this.dep.notify()           // 通知渲染watcher重新渲染
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
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
      // set new value
      const oldValue = this.value
      this.value = value
      this.dirty = false
      if (this.user) {
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
    if (this.dep && Dep.target) {       // 计算属性被访问时，target为render func
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
