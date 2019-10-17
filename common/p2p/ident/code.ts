import base from 'base-x';
import varint from 'varint';

export const base62 = base('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');

export class Encoder {
    private data = Buffer.alloc(256);
    length = 0;

    private reserve(add: number) {
        let index = this.length;

        this.length += add;
        if (this.length > this.data.length) {
            let size = Math.pow(2, Math.ceil(Math.log2(this.length)));
            let data = Buffer.alloc(size);
            this.data.copy(data, 0, 0);
            this.data = data;
        }

        return index;
    }

    get result() {
        return this.data.slice(0, this.length);
    }

    private raw(block: Buffer) {
        let index = this.reserve(block.length);
        block.copy(this.data, index);
    }

    include(other: Encoder) {
        this.raw(other.result);
    }

    uint(val: number) {
        let index = this.reserve(varint.encodingLength(val));
        varint.encode(val, this.data, index);
    }

    bytes(val: Buffer) {
        this.uint(val.length);
        this.raw(val);
    }

    string(val: string, encoding = 'utf8') {
        this.bytes(Buffer.from(val, encoding as any));
    }
}

export class Decoder {
    consumed: Buffer;
    remaining: Buffer;

    constructor(
        private readonly data: Buffer,
    ) {
        this.consumed = data.slice(0, 0);
        this.remaining = data.slice(0);
    }

    private shift(count: number) {
        let split = this.consumed.length + count;
        this.consumed = this.data.slice(0, split);
        this.remaining = this.data.slice(split);
    }

    uint(): number {
        let value = varint.decode(this.remaining);
        this.shift(varint.decode.bytes);
        return value;
    }

    bytes(): Buffer {
        let length = this.uint();
        let data = this.remaining.slice(0, length);
        this.shift(length);
        return data;
    }

    string(encoding = 'utf8'): string {
        return this.bytes().toString(encoding);
    }
}
