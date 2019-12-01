<template>
  <v-app dark class="app">
    <v-container fluid class="d-flex flex-column align-center">
      <div class="d-flex flex-column">
        <div class="d-flex mb-3">
          <div class="score d-flex justify-center" v-for="(snake, i) in state.snakes" :key="i">
            <span>{{ snake.body.length }}</span>
          </div>
        </div>

        <canvas class="white" ref="canvas" />

        <div v-if="state.role == 'accept'">
          <v-text-field
            ref="localName"
            readonly
            :value="url"
            prepend-icon="mdi-content-copy"
            @click:prepend="copy()"
          />
        </div>
      </div>
    </v-container>
  </v-app>
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
.v-text-field input {
  font-family: monospace;
}
</style>

<style scoped lang="scss">
.app {
  background-color: #e0e0e0 !important;
}

.score {
  flex: 1 1 0;
  background: white;
  margin-left: 12px;

  &:first-child {
    margin-left: 0;
  }

  > span {
    font-size: 18pt;
    font-weight: 700;
    font-family: Roboto;
  }
}
</style>
