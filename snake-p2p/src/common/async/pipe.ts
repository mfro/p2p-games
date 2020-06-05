import { Sink, Source } from './types';

export default pipe;

function pipe<T = never>(): Sink<T> & Source<T> {
    function flush() {
        while (write.length > 0 && attached.length > 0) {
            let writing = write.shift()!;

            for (let i = 0; i < attached.length; ++i) {
                let result = attached[i].callback(writing.value);
                if (result === undefined) continue;
                attached[i].resolve(result);
                attached.splice(i--, 1);
            }

            writing.resolve();
        }

        if (complete) {
            for (let reading of attached) {
                reading.resolve(undefined);
            }
        }
    }

    let complete = false;
    let write: { value: T, resolve: () => void }[] = [];
    let attached: { callback: (value: T) => any, resolve: (a: any) => void }[] = [];

    return {
        close() {
            complete = true;
            flush();
        },

        write: (data) => new Promise((resolve, reject) => {
            if (complete) throw new Error('Writing to completed pipe');

            write.push({ value: data, resolve });
            flush();
        }),

        attach: (callback) => new Promise((resolve) => {
            if (complete) return resolve(undefined);

            attached.push({ callback, resolve });
            flush();
        }),
    };
}
