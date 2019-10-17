import { Source } from './types';

export default event;

interface base<T> {
    listen(callback: (value: T) => void): () => void;
}

interface event<T = never> extends base<T> {
    next(): Promise<T>;
    until<TResult>(callback: (value: T) => TResult | undefined): Promise<TResult>;
    until<TResult>(callback: (value: T) => Promise<TResult | undefined>): Promise<TResult>;
}

function event<T = never>(): event.emitter<T> {
    let listeners = new Set<(value: T) => void>();

    return {
        event: event.make({
            listen(callback: any) {
                listeners.add(callback);
                return () => listeners.delete(callback);
            },
        }),

        emit(value?: any) {
            for (let listener of listeners) {
                listener(value);
            }
        },
    };
}

namespace event {
    export function make<T>(base: base<T>) {
        return {
            ...base,

            next() {
                return new Promise<any>((resolve) => {
                    let done = this.listen(value => {
                        done();
                        resolve(value);
                    });
                });
            },

            until(callback: any) {
                return new Promise<any>((resolve) => {
                    let done = this.listen(async value => {
                        let result = await callback(value);
                        if (result !== undefined) {
                            done();
                            resolve(result);
                        }
                    });
                });
            },
        };
    }

    export interface emitter<T = never> {
        event: event<T>;

        emit(value: T): void;
        emit(this: emitter<never>): void;
    }

    export function emitter<T>(base: emitter<T>) {
        return base;
    }

    interface EmitterA<K, R> {
        on(key: K, callback: (result: R) => void): void;
        off(key: K, callback: (result: R) => void): void;
    }

    interface EmitterB<K, R> {
        addEventListener(key: K, callback: (result: R) => void): void;
        removeEventListener(key: K, callback: (result: R) => void): void;
    }

    export function wrap<R, K extends string, T extends EmitterA<K, R> | EmitterB<K, R>>(target: T, key: K): event<R> {
        let t = target as any;
        let on = t.on || t.addEventListener;
        let off = t.off || t.removeEventListener;

        return event.make({
            listen(callback: any) {
                on.apply(t, [key, callback]);
                return () => off.apply(t, [key, callback]);
            },
        });
    }

    export function from_source<T>(src: Source<T>): event<T | null> {
        let e = event<T | null>();

        src.attach(block => {
            e.emit(block);
        });

        return e.event;
    }
}
