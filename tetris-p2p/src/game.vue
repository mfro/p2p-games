<template>
  <div v-show="!remote || connected">
    <div class="d-flex">
      <!-- <div title="'c' to hold">
        <canvas ref="hold" />
      </div> -->

      <div class="d-flex flex-column">
        <div class="score mb-2 d-flex justify-center" style="opacity: 0" v-if="remote">
          <span>Them</span>
        </div>
        <div class="score mb-2 d-flex justify-center" v-else-if="connected">
          <span>You</span>
        </div>
        <canvas ref="board" />
      </div>

      <!-- <div>
        <canvas ref="queue" />
      </div> -->
    </div>
  </div>
</template>

<script>
export default {
  name: 'tetris-game',

  props: {
    remote: Boolean,
    connected: Boolean,
  },
};
</script>

<style lang="scss" scoped>
.score {
  flex: 1 1 0;
  background: white;

  > span {
    font-size: 14pt;
    font-weight: 700;
    font-family: Roboto;
  }
}
</style>
