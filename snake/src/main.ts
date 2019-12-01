import alea from 'alea';
import { Vec } from './common/vec';
import { event } from './common/async';

import Vue from 'vue';
import Main from './main.vue';

type alea = ReturnType<typeof alea>;
const host = location.hostname == 'localhost' ? 'ws://localhost:8081' : 'wss://api.mfro.me/p2p';
const default_size = new Vec(50, 40);

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

class Game {
    food: Vec;
    counter = 0;
    complete = event();

    constructor(
        readonly canvas: CanvasRenderingContext2D,
        readonly size: Vec,
        readonly rand: alea,
        readonly local: LocalSnake
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
        for (let i = 0; i < this.local.body.length; ++i) {
            if (Vec.equals(this.local.body[i], pos)) {
                return [this.local, i];
            }
        }

        return null;
    }

    async play() {
        this.render();
        await this.complete.event.next();
    }

    destroy() {
        this.counter = -1;
    }

    render() {
        if (this.counter < 0) {
            return;
        } else if (this.counter % 2 == 0) {
            ++this.counter;
        } else {
            ++this.counter;

            let input = this.local.input();
            this.local.direction = input;

            let eaten = false;
            let collision = false;

            let move = Direction.toVec(this.local.direction);

            let head = Vec.add(this.local.body[0], move);
            if (!Vec.equals(head, this.food)) {
                this.local.body.pop();
            } else {
                eaten = true;
            }

            collision = collision || this.hit_test(head) != null
                || head.x < 0 || head.x >= this.size.x
                || head.y < 0 || head.y >= this.size.y

            move = Direction.toVec(this.local.direction);
            head = Vec.add(this.local.body[0], move);
            this.local.body.unshift(head);

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

            for (let cell of this.local.body) {
                drawCell(cell);
            }
        }

        requestAnimationFrame(() => this.render());
    }
}

const state = {
    snake: null as Snake | null,
};

function play_snake(context: CanvasRenderingContext2D) {
    let rand = alea();
    let game: Game | null = null;

    function start() {
        let local = new LocalSnake([
            new Vec(5, 5),
            new Vec(4, 5),
            new Vec(3, 5),
            new Vec(2, 5),
            new Vec(1, 5),
        ], Direction.RIGHT);
        game = new Game(context, default_size, rand, local);
        game.play();

        state.snake = local;
    }

    window.addEventListener('keydown', e => {
        if (e.keyCode == 82) {
            game!.local.destroy();
            game!.destroy();
            start();
        }
    });

    start();
}

function main(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')!;

    canvas.width = default_size.x * 10 - 1;
    canvas.height = default_size.y * 10 - 1;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';

    play_snake(context);
}

Vue.config.productionTip = false;

let vue = new Vue({
    mixins: [Main],
    data: { state },
    methods: {
        initialize(canvas: HTMLCanvasElement) {
            main(canvas);
        },
    },
});

vue.$mount('#app');
