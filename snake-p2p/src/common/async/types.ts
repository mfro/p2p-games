export interface Sink<T = Buffer> {
    close(): void;
    write(data: T): Promise<void>;
}

export interface Source<T = Buffer> {
    attach<T2>(cb: (value: T) => T2 | undefined): Promise<T2>;
}

export interface Channel extends Sink, Source {
}

export interface Dialer {
    dial(name: string): Promise<Channel>;
    incoming: Source<{ name: string, channel: Channel }>;
}
