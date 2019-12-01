import alea from 'alea';
import WebRTC from './common/p2p/rtc';
import { event, Channel } from './common/async';
import { FullIdent, Decoder, Encoder } from './common/p2p/ident';
import { Vec } from './common/vec';

import Vue from 'vue';
import Main from './main.vue';
import vuetify from './plugins/vuetify';

type alea = ReturnType<typeof alea>;
const host = location.hostname == 'localhost' ? 'ws://localhost:8081' : 'wss://api.mfro.me/p2p';
const default_size = new Vec(70, 50);

enum Direction {
    UP = 0,
    DOWN = 1,
    LEFT = 2,
    RIGHT = 3,
}

namespace Direction {
    export function opposite(dir: Direction) {
        if (dir == Direction.UP)
            return Direction.DOWN;
        if (dir == Direction.DOWN)
            return Direction.UP;
        if (dir == Direction.LEFT)
            return Direction.RIGHT;
        if (dir == Direction.RIGHT)
            return Direction.LEFT;
        throw new Error('?');
    }

    export function toVec(dir: Direction) {
        if (dir == Direction.UP)
            return new Vec(0, -1);
        if (dir == Direction.DOWN)
            return new Vec(0, 1);
        if (dir == Direction.LEFT)
            return new Vec(-1, 0);
        if (dir == Direction.RIGHT)
            return new Vec(1, 0);
        throw new Error('?');
    }
}

abstract class Snake {
    body: Vec[] = [];
    direction: Direction;

    constructor(
        body: Vec[],
        direction: Direction,
    ) {
        this.body = body.slice();
        this.direction = direction;
    }

    abstract destroy(): void;
}

class LocalSnake extends Snake {
    queue: Direction[] = [];

    constructor(
        body: Vec[],
        direction: Direction,
    ) {
        super(body, direction);

        this.handle = this.handle.bind(this);
        window.addEventListener('keydown', this.handle);
    }

    destroy() {
        window.removeEventListener('keydown', this.handle);
    }

    handle(e: KeyboardEvent) {
        if (e.keyCode == 37) // left arrow
            this.queue.push(Direction.LEFT)
        if (e.keyCode == 38) // up arrow
            this.queue.push(Direction.UP)
        if (e.keyCode == 39) // right arrow
            this.queue.push(Direction.RIGHT)
        if (e.keyCode == 40) // down arrow
            this.queue.push(Direction.DOWN)
    }

    input(): Direction {
        while (this.queue.length > 0) {
            let value = this.queue.shift()!;
            if (Direction.opposite(value) == this.direction)
                continue;

            this.direction = value;
            break;
        }

        return this.direction;
    }
}

class RemoteSnake extends Snake {
    input: Direction[] = [];
    destroyed = false;

    constructor(
        body: Vec[],
        direction: Direction,
        private channel: Channel
    ) {
        super(body, direction);

        channel.attach(raw => {
            if (this.destroyed) return true;

            let data = new Decoder(raw);
            let int = data.uint();
            this.input.push(int as Direction);
        });
    }

    destroy() {
        this.destroyed = true;
    }

    async send_input(dir: Direction) {
        let data = new Encoder();
        data.uint(dir);
        await this.channel.write(data.result);
    }
}

class Game {
    food: Vec;
    counter = 0;
    complete = event();

    constructor(
        readonly canvas: CanvasRenderingContext2D,
        readonly size: Vec,
        readonly rand: alea,
        readonly local: LocalSnake,
        readonly remote: RemoteSnake[],
    ) {
        this.food = Vec.zero;
        this.make_food();
    }

    make_food() {
        while (true) {
            let x = this.rand.uint32() % this.size.x;
            let y = this.rand.uint32() % this.size.y;
            let check = new Vec(x, y);
            if (this.hit_test(check)) continue;
            this.food = check;
            break;
        }
    }

    hit_test(pos: Vec): [Snake, number] | null {
        for (let snake of [this.local, ...this.remote]) {
            for (let i = 0; i < snake.body.length; ++i) {
                if (Vec.equals(snake.body[i], pos)) {
                    return [snake, i];
                }
            }
        }

        return null;
    }

    async play() {
        this.render();
        await this.complete.event.next();
    }

    render() {
        if (this.counter % 2 == 0) {
            ++this.counter;

            let input = this.local.input();
            this.local.direction = input;
            for (let snake of this.remote) {
                snake.send_input(input);
            }
        } else {
            let ready = true;
            for (let snake of this.remote) {
                if (snake.input.length == 0) {
                    ready = false;
                    break;
                }
            }

            if (ready) {
                ++this.counter;

                for (let snake of this.remote) {
                    snake.direction = snake.input.shift()!;
                }

                let eaten = false;
                let collision = false;

                let snakes = [this.local, ...this.remote];
                for (let snake of snakes) {
                    let move = Direction.toVec(snake.direction);

                    let head = Vec.add(snake.body[0], move);
                    if (!Vec.equals(head, this.food)) {
                        snake.body.pop();
                    } else {
                        eaten = true;
                    }

                    collision = collision || this.hit_test(head) != null
                        || head.x < 0 || head.x >= this.size.x
                        || head.y < 0 || head.y >= this.size.y
                }

                for (let snake of snakes) {
                    let move = Direction.toVec(snake.direction);
                    let head = Vec.add(snake.body[0], move);
                    snake.body.unshift(head);
                }

                if (collision) {
                    this.complete.emit();
                    return;
                }

                if (eaten) {
                    this.make_food();
                }

                let drawCell = (pos: Vec) => {
                    this.canvas.fillStyle = 'black';
                    this.canvas.fillRect(pos.x * 10, pos.y * 10, 9, 9);
                }

                this.canvas.clearRect(0, 0, this.size.x * 10, this.size.y * 10);
                drawCell(this.food);

                for (let snake of snakes) {
                    for (let cell of snake.body) {
                        drawCell(cell);
                    }
                }
            }
        }

        requestAnimationFrame(() => this.render());
    }
}

const state = {
    role: '',
    name: '',
    snakes: [] as Snake[],
};

async function play_snake(context: CanvasRenderingContext2D, channel: Channel, dialer: boolean) {
    let localSeed = Math.floor(Math.random() * 1000000);
    let localData = new Encoder();
    localData.uint(localSeed);

    await channel.write(localData.result);
    let remoteRaw = await channel.attach(a => a);
    if (remoteRaw == null) throw new Error('Communication error');
    let remoteData = new Decoder(remoteRaw);

    let remoteSeed = remoteData.uint();

    const start1 = [];
    const start2 = [];

    for (let i = 0; i < 5; ++i) {
        start1.push(new Vec(5 - i, 5));
        start2.push(new Vec(default_size.x - 6 + i, default_size.y - 6));
    }

    let restart = event();

    window.addEventListener('keydown', e => {
        if (e.keyCode == 82)
            restart.emit();
    });

    for (let i = 0; true; ++i) {
        let rand, local, remote;
        if (dialer) {
            rand = alea(localSeed, remoteSeed, i);
            local = new LocalSnake(start1, Direction.RIGHT);
            remote = new RemoteSnake(start2, Direction.LEFT, channel);
        } else {
            rand = alea(remoteSeed, localSeed, i);
            local = new LocalSnake(start2, Direction.LEFT);
            remote = new RemoteSnake(start1, Direction.RIGHT, channel);
        }

        state.role = 'play';
        state.snakes = [local, remote]

        let game = new Game(context, default_size, rand, local, [remote]);
        await game.play();

        state.role = 'done';

        let localRestart = restart.event.next();
        let remoteRestart = channel.attach(a => a);

        await localRestart;
        let data = new Encoder();
        data.uint(i);
        await channel.write(data.result);
        await remoteRestart;
    }
}

async function main(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')!;

    canvas.width = default_size.x * 10 - 1;
    canvas.height = default_size.y * 10 - 1;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';

    let self = await FullIdent.generate();
    state.name = self.name;

    let rtc = await WebRTC(self, { host });
    let dialer = WebRTC.dialer(rtc);

    if (location.hash) {
        state.role = 'dial';

        let peer = location.hash.substr(1);
        let channel = await dialer.dial(peer);

        state.role = 'setup';

        await play_snake(context, channel, true);
    } else {
        state.role = 'accept';

        let incoming = await dialer.incoming.attach(a => a);

        state.role = 'setup';

        await play_snake(context, incoming!.channel, false);
    }
}

Vue.config.productionTip = false;

let vue = new Vue({
    mixins: [Main],
    data: { state },
    vuetify,
    methods: {
        initialize(canvas: HTMLCanvasElement) {
            main(canvas);
        },
    },
});

vue.$mount('#app');
