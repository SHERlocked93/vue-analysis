<template>
  {{ name }}
  <button @click='change'>change</button>
  <button @click='changeLast'>change last name</button>
</template>

<script type='text/javascript'>
  export default {
    data() {
      return {
        text: {
          firstName: ' Qian ',
          lastName: ' Yu ',
          useless: 1
        }
      }
    },
    methods: {
      change() {
        this.useless = 2
        console.log(this.useless)
      },
      
      changeLast() {
        this.lastName = ' Zhang '
      }
    },
    computed: {
      name() {
        if (this.useless > 1) {
          return this.firstName + ',' + this.lastName
        }
        return 'Please click change'
      }
    }
  }
</script>

<style rel="stylesheet/scss" lang="scss" scoped>

</style>