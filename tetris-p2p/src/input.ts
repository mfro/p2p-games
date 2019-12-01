import { event } from './common/async';

export const
    LEFT = 37,
    UP = 38,
    RIGHT = 39,
    DOWN = 40,
    SPACE = 32,
    C = 67,
    R = 82;

const down = new Set<number>();
const eKeydown = new Map<number, event.emitter>();
const eKeyup = new Map<number, event.emitter>();

window.addEventListener('keyup', e => {
    down.delete(e.keyCode);

    let ev = eKeyup.get(e.keyCode);
    if (ev == null) return;

    ev.emit();
});

window.addEventListener('keydown', e => {
    console.log(e.keyCode, e.key);

    if (down.has(e.keyCode)) return;
    down.add(e.keyCode);

    let ev = eKeydown.get(e.keyCode);
    if (ev == null) return;

    ev.emit();
});

export function keydown(key: number) {
    let ev = eKeydown.get(key);
    if (!ev) eKeydown.set(key, ev = event());

    return ev.event;
}

export function keyup(key: number) {
    let ev = eKeyup.get(key);
    if (!ev) eKeyup.set(key, ev = event());

    return ev.event;
}
