export class Vec {
    constructor(
        readonly x: number,
        readonly y: number,
    ) { }

    static zero = new Vec(0, 0);

    static add(a: Vec, b: Vec) {
        return new Vec(a.x + b.x, a.y + b.y);
    }

    static scale(a: Vec, c: number) {
        return new Vec(a.x * c, a.y * c);
    }

    static equals(a: Vec, b: Vec) {
        return a.x == b.x && a.y == b.y;
    }
}

