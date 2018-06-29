import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

/**
 * 这里就是vue的最开始定义了，不用ES6的Class语法是因为mixin模块划分的方便
 * @param options 传入的参数
 * @constructor
 */
function Vue(options) {
    if (process.env.NODE_ENV !== 'production' &&
      !(this instanceof Vue)
    ) {
        warn('Vue is a constructor and should be called with the `new` keyword')
    }
    this._init(options)         // 初始化方法，位于 initMixin 中
}

// 下面的mixin往Vue.prototype上各种挂载
initMixin(Vue)          // 给Vue.prototype添加：_init函数,...
stateMixin(Vue)         // 给Vue.prototype添加：$data属性, $props属性, $set函数, $delete函数, $watch函数,...
eventsMixin(Vue)        // 给Vue.prototype添加：$on函数, $once函数, $off函数, $emit函数, $watch方法,...
lifecycleMixin(Vue)     // 给Vue.prototype添加: _update方法, $forceUpdate函数, $destroy函数,...
renderMixin(Vue)        // 给Vue.prototype添加: $nextTick函数, _render函数,...

export default Vue
