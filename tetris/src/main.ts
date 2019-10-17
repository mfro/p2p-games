import Vue from 'vue'
import Main from './main.vue'
import vuetify from './plugins/vuetify';

import alea from 'alea';
import WebRTC from './common/p2p/rtc';
import { event, Channel } from './common/async';
import { FullIdent, Decoder, Encoder } from './common/p2p/ident';
import { Vec } from './common/vec';

import * as input from './input';

Vue.config.productionTip = false;

type alea = ReturnType<typeof alea>;

const config = {
    rtc_host: 'wss://api.mfro.me/p2p',
    size: new Vec(10, 20),
    scale: 24,
    DAS: 100,
    ARR: 28,
};

class Tetronimo {
    readonly center: Vec;
    readonly points: Vec[];

    constructor(
        readonly size: number,
        center: [number, number],
        readonly color: string,
        points: [number, number][],
    ) {
        this.center = new Vec(center[0], center[1]);
        this.points = points.map(([x, y]) => new Vec(x, y));
    }

    rasterize(position: Vec, rotation: number) {
        let tiles = this.points.slice();
        for (let i = 0; i < rotation; ++i) {
            for (let j = 0; j < tiles.length; ++j) {
                tiles[j] = new Vec(this.size - tiles[j].y - 1, tiles[j].x);
            }
        }
        let offset = Vec.add(position, Vec.scale(this.center, -1));
        return tiles.map(v => Vec.add(offset, v));
    }
}

const garbage = '#707070';
const tetronimos = [
    new Tetronimo(4, [1, 1], '#0f9bd7', [[0, 1], [1, 1], [2, 1], [3, 1]]), // I
    new Tetronimo(2, [0, 1], '#e39f02', [[0, 0], [0, 1], [1, 0], [1, 1]]), // O
    new Tetronimo(3, [1, 1], '#af298a', [[1, 0], [0, 1], [1, 1], [2, 1]]), // T
    new Tetronimo(3, [1, 1], '#2141c6', [[0, 0], [0, 1], [1, 1], [2, 1]]), // J
    new Tetronimo(3, [1, 1], '#e35b02', [[2, 0], [0, 1], [1, 1], [2, 1]]), // L
    new Tetronimo(3, [1, 1], '#59b101', [[1, 0], [2, 0], [0, 1], [1, 1]]), // S
    new Tetronimo(3, [1, 1], '#d70f37', [[0, 0], [1, 0], [1, 1], [2, 1]]), // Z
];

let state = {
    role: '',
    name: '',
    connected: false,
    restart: '',
};

let repeat_id: ReturnType<typeof setTimeout>;
function repeat(key: number, fn: () => void) {
    let id: typeof repeat_id;

    function repeat() {
        fn();
        id = repeat_id = setTimeout(repeat, config.ARR);
    }

    let a = input.keydown(key).listen(() => {
        fn();
        clearTimeout(repeat_id);
        id = repeat_id = setTimeout(repeat, config.DAS);
    });

    let b = input.keyup(key).listen(() => {
        clearTimeout(id);
    });

    return () => (a(), b());
}

abstract class Game {
    board: (string | null)[][];
    queue: Tetronimo[] = [];
    hold: Tetronimo | null;
    garbage: number;
    falling: Tetronimo | null;
    rotation: number;
    position: Vec;

    context: CanvasRenderingContext2D;

    constructor(
        readonly canvas: HTMLCanvasElement,
        readonly size: Vec,
    ) {
        this.context = canvas.getContext('2d')!;

        canvas.width = (size.x + 8) * config.scale;
        canvas.height = size.y * config.scale;
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';

        this.board = [];
        this.hold = null;
        this.garbage = 0;
        this.falling = tetronimos[0];
        this.position = Vec.zero;
        this.rotation = 0;

        for (let x = 0; x < size.x; ++x) {
            this.board[x] = [];
            for (let y = 0; y < size.y; ++y) {
                this.board[x][y] = null;
            }
        }
    }

    get_state() {
        return Buffer.from(JSON.stringify({
            board: this.board,
            queue: this.queue.map(q => tetronimos.indexOf(q)),
            hold: this.hold && tetronimos.indexOf(this.hold),
            garbage: this.garbage,
            falling: this.falling && tetronimos.indexOf(this.falling),
            rotation: this.rotation,
            position: this.position,
        }));
    }

    set_state(arg: Buffer) {
        let state = JSON.parse(arg.toString());
        this.board = state.board;
        this.queue = state.queue.map((q: number) => tetronimos[q]);
        this.hold = state.hold === null ? null : tetronimos[state.hold];
        this.garbage = state.garbage;
        this.falling = state.falling === null ? null : tetronimos[state.falling];
        this.rotation = state.rotation;
        this.position = state.position;
    }

    abstract destroy(): void;

    protected hit(t: Tetronimo, pos: Vec, rot: number) {
        let list = t.rasterize(pos, rot);
        for (let tile of list) {
            if (tile.x < 0 || tile.x >= this.size.x)
                return true;
            if (tile.y >= this.size.y)
                return true;
            let hit = this.board[tile.x][tile.y];
            if (hit != null)
                return true;
        }

        return false;
    }

    protected drop_position() {
        if (!this.falling) return null;

        let pos = this.position;

        while (true) {
            let next = new Vec(pos.x, pos.y + 1);
            if (this.hit(this.falling, next, this.rotation)) break;
            pos = next;
        }

        return pos;
    }

    render_preview(t: Tetronimo | null, pos: Vec) {
        if (t) {
            let scale = config.scale * 3 / 4;
            this.context.fillStyle = t.color;
            let minX = t.points.reduce((a, b) => Math.min(a, b.x), 4);
            let maxX = t.points.reduce((a, b) => Math.max(a, b.x), 0);
            let minY = t.points.reduce((a, b) => Math.min(a, b.y), 4);
            let maxY = t.points.reduce((a, b) => Math.max(a, b.y), 0);
            let offset = new Vec(
                Math.floor(pos.x + (2 * config.scale) - ((maxX - minX + 1) / 2) * scale),
                Math.floor(pos.y + (2 * config.scale) - ((maxY - minY + 1) / 2) * scale)
            );

            for (let tile of t.points) {
                this.context.fillRect(
                    offset.x + (tile.x - minX) * scale,
                    offset.y + (tile.y - minY) * scale,
                    scale, scale
                );
            }
        }

        const inset = 12;
        const length = 5.5;

        this.context.strokeStyle = 'gray';
        this.context.beginPath();
        this.context.moveTo(pos.x + inset + length + 0.5, pos.y + inset + 0.5);
        this.context.lineTo(pos.x + inset + 0.5, pos.y + inset + 0.5);
        this.context.lineTo(pos.x + inset + 0.5, pos.y + inset + length + 0.5);

        this.context.moveTo(pos.x + inset + 0.5, pos.y + 4 * config.scale - inset - length - 0.5);
        this.context.lineTo(pos.x + inset + 0.5, pos.y + 4 * config.scale - inset - 0.5);
        this.context.lineTo(pos.x + inset + length + .5, pos.y + 4 * config.scale - inset - 0.5);

        this.context.moveTo(pos.x + 4 * config.scale - inset - length - 0.5, pos.y + 4 * config.scale - inset - 0.5);
        this.context.lineTo(pos.x + 4 * config.scale - inset - 0.5, pos.y + 4 * config.scale - inset - 0.5);
        this.context.lineTo(pos.x + 4 * config.scale - inset - 0.5, pos.y + 4 * config.scale - inset - length - 0.5);

        this.context.moveTo(pos.x + 4 * config.scale - inset - 0.5, pos.y + inset + length + 0.5);
        this.context.lineTo(pos.x + 4 * config.scale - inset - 0.5, pos.y + inset + 0.5);
        this.context.lineTo(pos.x + 4 * config.scale - inset - length - 0.5, pos.y + inset + 0.5);
        this.context.stroke();
    }

    render_board(pos: Vec) {
        this.context.fillStyle = 'white';
        this.context.fillRect(pos.x, pos.y, this.size.x * config.scale, this.size.y * config.scale);

        this.context.strokeStyle = '#efefef';
        for (let x = 0; x < this.size.x; ++x) {
            this.context.beginPath();
            this.context.moveTo(pos.x + x * config.scale + 0.5, pos.y + 0);
            this.context.lineTo(pos.x + x * config.scale + 0.5, pos.y + this.size.y * config.scale);
            this.context.moveTo(pos.x + (x + 1) * config.scale - 0.5, pos.y + 0);
            this.context.lineTo(pos.x + (x + 1) * config.scale - 0.5, pos.y + this.size.y * config.scale);
            this.context.stroke();
        }
        for (let y = 0; y < this.size.y; ++y) {
            this.context.beginPath();
            this.context.moveTo(pos.x + 0, pos.y + y * config.scale + 0.5);
            this.context.lineTo(pos.x + this.size.x * config.scale, pos.y + y * config.scale + 0.5);
            this.context.moveTo(pos.x + 0, pos.y + (y + 1) * config.scale - 0.5);
            this.context.lineTo(pos.x + this.size.x * config.scale, pos.y + (y + 1) * config.scale - 0.5);
            this.context.stroke();
        }

        for (let x = 0; x < this.size.x; ++x) {
            for (let y = 0; y < this.size.y; ++y) {
                let color = this.board[x][y];
                if (color == null) continue;
                this.context.fillStyle = color;
                this.context.fillRect(pos.x + x * config.scale, pos.y + y * config.scale, config.scale, config.scale);
            }
        }

        if (this.falling) {
            this.context.fillStyle = this.falling.color;
            for (let tile of this.falling.rasterize(this.position, this.rotation)) {
                this.context.fillRect(pos.x + tile.x * config.scale, pos.y + tile.y * config.scale, config.scale, config.scale);
            }

            let drop_pos = this.drop_position()!;
            this.context.fillStyle = this.falling.color + '80';
            for (let tile of this.falling.rasterize(drop_pos, this.rotation)) {
                this.context.fillRect(pos.x + tile.x * config.scale, pos.y + tile.y * config.scale, config.scale, config.scale);
            }
        }
    }

    render() {
        this.context.clearRect(0, 0, (this.size.x + 8) * config.scale, this.size.y * config.scale);

        this.render_preview(this.hold, new Vec(0, 0));

        for (let i = 0; i < this.queue.length; ++i) {
            this.render_preview(this.queue[i], new Vec((this.size.x + 4) * config.scale, i * 4 * config.scale));
        }

        this.render_board(new Vec(4 * config.scale, 0));

        this.context.fillStyle = 'red';
        this.context.fillRect(
            4 * config.scale - 4, (this.size.y - this.garbage) * config.scale,
            4, this.garbage * config.scale
        );
    }
}

class RemoteGame extends Game {
    private destroyed = false;
    complete = event();

    constructor(
        canvas: HTMLCanvasElement,
        size: Vec,
        channel: Channel,
    ) {
        super(canvas, size);

        channel.attach((data) => {
            if (this.destroyed) return false;
            if (data[0] != 0) return;

            this.set_state(data.slice(1));
            if (this.falling == null) this.complete.emit();

            requestAnimationFrame(() => this.render());
        });
    }

    async play() {
        await this.complete.event.next();
    }

    destroy() {
        this.destroyed = true;
    }
}

class LocalGame extends Game {
    used: (() => void)[] = [];
    attack = event<number>();
    update = event();
    complete = event();

    counter = 0;
    hold_used: boolean;
    fall_tick: number;
    animation_frame?: number;

    constructor(
        canvas: HTMLCanvasElement,
        size: Vec,
        readonly rand: alea,
    ) {
        super(canvas, size);

        for (let i = 0; i < 5; ++i) {
            let index = this.rand.uint32() % tetronimos.length;
            this.queue.push(tetronimos[index]);
        }

        this.hold_used = false;
        this.fall_tick = 0;
        this.new_drop();

        this.board = [];
        for (let x = 0; x < size.x; ++x) {
            this.board[x] = [];
            for (let y = 0; y < size.y; ++y) {
                this.board[x][y] = null;
            }
        }

        this.used = [
            repeat(input.LEFT, () => this.move(-1)),
            repeat(input.RIGHT, () => this.move(1)),
            repeat(input.DOWN, () => this.soft_drop()),
            repeat(input.C, () => this.swap_hold()),
            input.keydown(input.UP).listen(() => this.rotate(1)),
            input.keydown(input.SPACE).listen(() => this.hard_drop()),
        ];
    }

    async play() {
        this.tick();
        await this.complete.event.next();
    }

    swap_hold() {
        if (!this.falling) return false;
        if (this.hold_used) return false;

        let old = this.hold;
        this.hold = this.falling;
        this.new_drop(old || undefined);

        this.hold_used = true;
        this.update.emit();
        return true;
    }

    rotate(count: number) {
        if (!this.falling) return false;

        let next = (this.rotation + count) % 4;
        if (next < 0) next += 4;

        if (this.hit(this.falling, this.position, next)) {
            return false;
        }

        this.rotation = next;
        this.update.emit();
        return true;
    }

    move(offset: number) {
        if (!this.falling) return false;

        let next = new Vec(this.position.x + offset, this.position.y);
        if (this.hit(this.falling, next, this.rotation)) {
            return false;
        }

        this.position = next;
        this.update.emit();
        return true;
    }

    hard_drop() {
        if (!this.falling) return;

        while (!this.fall_one(true));
        this.update.emit();
    }

    soft_drop() {
        if (!this.falling) return;

        this.fall_one(false);
        this.update.emit();
    }

    destroy() {
        for (let cb of this.used) cb();
        cancelAnimationFrame(this.animation_frame!);
    }

    private new_drop(force?: Tetronimo) {
        let falling;
        if (force) {
            falling = force;
        } else {
            falling = this.queue.shift()!;
            let index = this.rand.uint32() % tetronimos.length;
            this.queue.push(tetronimos[index]);

            if (this.garbage > 0) {
                for (let y = 0; y < this.size.y - this.garbage; ++y) {
                    for (let x = 0; x < this.size.x; ++x) {
                        this.board[x][y] = this.board[x][y + this.garbage];
                    }
                }
                for (let y = this.size.y - this.garbage; y < this.size.y; ++y) {
                    for (let x = 0; x < this.size.x; ++x) {
                        this.board[x][y] = garbage;
                    }
                }
                this.garbage = 0;
            }
        }

        let position = new Vec(Math.floor((this.size.x - 1) / 2), 0)
        let rotation = 0;
        let hit = this.hit(falling, position, rotation);
        if (hit) {
            this.falling = null;
        } else {
            this.falling = falling;
            this.rotation = rotation;
            this.position = position;
            this.hold_used = false;
            this.fall_tick = this.counter + 50;
        }
    }

    private clear_rows() {
        let count = 0;
        for (let y = 0; y < this.size.y; ++y) {
            let full = true;
            for (let x = 0; x < this.size.x && full; ++x) {
                full = this.board[x][y] != null &&
                    this.board[x][y] != garbage;
            }
            if (!full) continue;

            ++count;
            for (let y2 = y; y2 >= 0; --y2) {
                for (let x = 0; x < this.size.x; ++x) {
                    this.board[x][y2] = this.board[x][y2 - 1];
                }
            }
        }


        let attack;
        if (count == 2) attack = 1;
        else if (count == 3) attack = 2;
        else if (count == 4) attack = 4;
        else attack = 0;

        if (attack > this.garbage) {
            attack -= this.garbage;
            this.garbage = 0;
        } else {
            this.garbage -= attack;
            attack = 0;
        }

        while (attack > 0) {
            let clear = true;
            for (let x = 0; x < this.size.x && clear; ++x) {
                clear = this.board[x][this.size.y - 1] == garbage;
            }
            if (!clear) break;
            --attack;
            for (let y2 = this.size.y - 1; y2 >= 0; --y2) {
                for (let x = 0; x < this.size.x; ++x) {
                    this.board[x][y2] = this.board[x][y2 - 1];
                }
            }
        }

        if (attack > 0) {
            this.attack.emit(attack);
        }
    }

    private fall_one(forced: boolean) {
        if (!this.falling) return true;

        let next = new Vec(this.position.x, this.position.y + 1);

        if (this.hit(this.falling, next, this.rotation)) {
            if (!forced) return;

            for (let tile of this.falling.rasterize(this.position, this.rotation)) {
                this.board[tile.x][tile.y] = this.falling.color;
            }
            this.clear_rows();
            this.new_drop();
            return true;
        }

        this.position = next;
        this.fall_tick = this.counter + 50;
        return false;
    }

    private tick() {
        ++this.counter;

        if (this.counter == this.fall_tick) {
            this.fall_one(true);
            this.update.emit();
        }

        this.render();

        if (this.falling) {
            this.animation_frame = requestAnimationFrame(() => this.tick());
        } else {
            this.complete.emit();
        }
    }
}

async function play_tetris(canvas: HTMLCanvasElement[], channel: Channel, dialer: boolean) {
    let localSeed = Math.floor(Math.random() * 1000000);
    let localData = new Encoder();
    localData.uint(localSeed);

    await channel.write(localData.result);
    let remoteRaw = await channel.attach(a => a);
    if (remoteRaw == null) throw new Error('Communication error');
    let remoteData = new Decoder(remoteRaw);

    let remoteSeed = remoteData.uint();

    for (let i = 0; true; ++i) {
        let rand;
        if (dialer) {
            rand = alea(localSeed, remoteSeed, i);
        } else {
            rand = alea(remoteSeed, localSeed, i);
        }

        state.role = 'play';
        state.connected = true;

        let local = new LocalGame(canvas[0], config.size, rand);
        let remote = new RemoteGame(canvas[1], config.size, channel);
        let complete = false;

        local.update.event.until(() => {
            if (local == null) return true;

            channel.write(Buffer.concat([
                Buffer.from([0]),
                local.get_state(),
            ]));
        });

        local.attack.event.until((attack) => {
            if (complete) return false;

            if (attack > 0) {
                console.log(`send ${attack}`)
                channel.write(Buffer.from([1, attack]));
            }
        });

        channel.attach((data) => {
            if (complete) return false;
            if (data[0] != 1) return;

            let attack = data[1];
            console.log(`recv ${attack}`)
            local.garbage += attack;
            local.update.emit();
        })

        await Promise.race([local.play(), remote.play()]);

        local.destroy();
        remote.destroy();

        state.role = 'done';

        let localRestart = input.keydown(input.R).next();
        let remoteRestart = channel.attach(a => a);

        localRestart.then(() => state.restart = 'local')
        remoteRestart.then(() => state.restart = 'remote')

        await localRestart;
        let data = new Encoder();
        data.uint(i);
        await channel.write(data.result);
        await remoteRestart;

        state.restart = '';
    }
}

async function main(canvas: HTMLCanvasElement[]) {
    let self = await FullIdent.generate();
    state.name = self.name;

    let rtc = await WebRTC(self, { host: config.rtc_host });
    let dialer = WebRTC.dialer(rtc);

    if (location.hash) {
        state.role = 'dial';

        let peer = location.hash.substr(1);
        let channel = await dialer.dial(peer);

        state.role = 'setup';

        await play_tetris(canvas, channel, true);
    } else {
        let waiting_game = new LocalGame(canvas[0], config.size, alea());
        waiting_game.play();

        let cleanup = input.keydown(input.R).listen(() => {
            waiting_game.destroy();
            waiting_game = new LocalGame(canvas[0], config.size, alea());
            waiting_game.play();
        });

        state.role = 'accept';

        let incoming = await dialer.incoming.attach(a => a);

        state.role = 'setup';
        waiting_game.destroy();
        cleanup();

        await play_tetris(canvas, incoming!.channel, false);
    }
}

let vue = new Vue({
    mixins: [Main],
    data: { state },
    vuetify,
    methods: {
        initialize(c1: HTMLCanvasElement, c2: HTMLCanvasElement) {
            main([c1, c2]);
        },
    },
});

vue.$mount('#app');
