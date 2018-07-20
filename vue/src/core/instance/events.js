/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  handleError,
  formatComponentName
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

/* 初始化事件 */
export function initEvents(vm: Component) {
  vm._events = Object.create(null)                  // 在vm上创建一个_events对象，用来存放事件
  // 这个bool标志位来表明是否存在钩子，而不需要通过哈希表的方法来查找是否有钩子，这样做可以减少不必要的开销，优化性能
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners    // 初始化父组件attach的事件
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

/* 有once的时候注册一个只会触发一次的方法，没有once的时候注册一个事件方法 */
function add(event, fn, once) {
  if (once) {
    target.$once(event, fn)
  } else {
    target.$on(event, fn)
  }
}

/* 销毁一个事件方法 */
function remove(event, fn) {
  target.$off(event, fn)
}

/* 更新组件的监听事件 */
export function updateComponentListeners(
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, vm)
  target = undefined
}

/* 为Vue原型加入操作事件的方法 */
export function eventsMixin(Vue: Class<Component>) {
  const hookRE = /^hook:/
  Vue.prototype.$on = function(event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {                   // 如果是数组的时候，则递归$on，为每一个成员都绑定上方法
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }
  
  /* 注册一个只执行一次的事件方法 */
  Vue.prototype.$once = function(event: string, fn: Function): Component {
    const vm: Component = this
    
    function on() {
      vm.$off(event, on)        // 在第一次执行的时候将该事件销毁
      fn.apply(vm, arguments)   // 执行注册的方法
    }
    
    on.fn = fn
    vm.$on(event, on)
    return vm
  }
  
  /* 注销一个事件，如果不传参则注销所有事件，如果只传event名则注销该event下的所有方法 */
  Vue.prototype.$off = function(event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) {                     // 如果event是数组则递归注销事件
      for (let i = 0, l = event.length; i < l; i++) {
        this.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    if (!cbs) {                                    // 本身不存在该事件则直接返回
      return vm
    }
    if (!fn) {                                     // 如果没传fn参数则注销该event方法下的所有方法
      vm._events[event] = null
      return vm
    }
    if (fn) {
      // specific handler 遍历寻找对应方法并删除
      let cb
      let i = cbs.length
      while (i--) {
        cb = cbs[i]
        if (cb === fn || cb.fn === fn) {
          cbs.splice(i, 1)
          break
        }
      }
    }
    return vm
  }
  
  /* 触发一个事件方法 */
  Vue.prototype.$emit = function(event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs         // 将类数组的对象转换成数组
      const args = toArray(arguments, 1)
      for (let i = 0, l = cbs.length; i < l; i++) {     // 遍历执行
        try {
          cbs[i].apply(vm, args)
        } catch (e) {
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
}
