<template>
  <div class="root">
    <div>
      <div>
        <div class="score" v-if="state.snake">
          <span>{{ state.snake.body.length }}</span>
        </div>
      </div>

      <canvas class="white" ref="canvas" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'snake',

  mounted() {
    this.initialize(this.$refs.canvas);
  },

  computed: {
    url() {
      return `${location.href}#${this.state.name}`;
    },
  },

  methods: {
    copy() {
      let ref = this.$refs.localName.$refs.input;

      ref.select();
      ref.setSelectionRange(0, this.url.length);

      document.execCommand('copy');
    },
  },
};
</script>

<style lang="scss">
html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  background-color: #e0e0e0 !important;
}
</style>

<style scoped lang="scss">
.root {
  display: flex;
  justify-content: center;

  > div {
    display: flex;
    flex-direction: column;
  }
}

.score {
  flex: 1 1 0;
  margin: 10px 0;
  background: white;
  text-align: center;

  > span {
    font-size: 18pt;
    font-weight: 700;
    font-family: Roboto;
  }
}

canvas {
  background: white;
}
</style>
