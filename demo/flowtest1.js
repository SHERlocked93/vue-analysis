/* eslint-disable no-unused-vars,no-undef */
// @flow

export const num: number = 123
export const str: string = 'a'
export const b: boolean = true
export const n: null = null
export const undef: void = undefined
export const str1: ?string = 'null'

export const v: void | string = undefined
export const a: any = null

// region 类型推断
function split(str) {
  return str.split(' ')
}

split('13')

function add(x, y) {
  return x + y
}

add('Hello', 11)
// endregion

// region 类型注释
function add1(x: string, y: number): string {
  return x + y
}

add1('hello', 123)
// endregion

// region 数组、对象、类
const arr: Array<number> = [1, 2, 3]
arr.push(23)

class Bar {
  x: string
  y: string | number
  z: boolean
  
  constructor(x: string, y: string | number) {
    this.x = x
    this.y = y
    this.z = false
  }
}

const bar: Bar = new Bar('hello', 4)

const obj: { a: string, b: number, c: Array<string>, d: Bar } = {
  a: 'hello',
  b: 11,
  c: ['hello', 'world'],
  d: new Bar('hello', 3)
}
// endregion
