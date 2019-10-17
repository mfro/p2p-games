<template>
  <v-app dark class="app">
    <v-container fluid class="d-flex flex-column align-center">
      <div>
        <div class="mb-3 d-flex justify-center">
          <tetris-game :connected="state.connected" ref="local" />

          <div class="mx-9" v-if="state.connected" />

          <tetris-game remote :connected="state.connected" ref="remote" />
        </div>

        <div v-if="state.role == 'accept'">
          <v-text-field
            solo
            dense
            ref="localName"
            readonly
            :value="url"
            prepend-icon="mdi-content-copy"
            @click:prepend="copy()"
          />
        </div>

        <div v-else-if="state.role == 'done'" class="d-flex justify-center">
          <v-card class="px-3 py-2 d-flex align-center">
            <v-icon large class="success--text" v-if="state.restart == 'local'">mdi-check</v-icon>
            <v-icon large v-else>mdi-timer-sand-empty</v-icon>
            <span class="title mx-2">Press R to restart</span>
            <v-icon large class="success--text" v-if="state.restart == 'remote'">mdi-check</v-icon>
            <v-icon large v-else>mdi-timer-sand-empty</v-icon>
          </v-card>
        </div>
      </div>
    </v-container>
  </v-app>
</template>

<script>
import TetrisGame from './game.vue';

export default {
  name: 'tetris',

  components: {
    TetrisGame,
  },

  mounted() {
    this.initialize(
      this.$refs.local.$refs.board,
      this.$refs.remote.$refs.board,
    );
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
</style>
